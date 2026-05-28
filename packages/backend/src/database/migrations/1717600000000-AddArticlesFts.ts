import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArticlesFts1717600000000 implements MigrationInterface {
  name = 'AddArticlesFts1717600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // `search_vector` is denormalized index data — it's regenerated from
    // (title, summary, content_raw) by the trigger below on every
    // INSERT/UPDATE-of-those-columns. The application code never reads
    // or writes this column directly; it only appears in the WHERE
    // clause via `@@ websearch_to_tsquery(...)`.
    await queryRunner.query(`
      ALTER TABLE "articles"
        ADD COLUMN IF NOT EXISTS "search_vector" tsvector
    `);

    // Backfill for existing rows. New rows hit the trigger so this
    // one-shot UPDATE is only relevant on the initial migration; it's
    // gated on IS NULL so a re-run after a partial failure picks up
    // only the unprocessed rows.
    await queryRunner.query(`
      UPDATE "articles"
      SET "search_vector" =
        to_tsvector('english',
          coalesce("title", '') || ' ' ||
          coalesce("summary", '') || ' ' ||
          coalesce("content_raw", '')
        )
      WHERE "search_vector" IS NULL
    `);

    // GIN is the right index for tsvector: it stores one entry per
    // distinct lexeme, so `@@` lookups are sub-linear. The trade-off
    // (slower writes than B-tree) is fine here because writes happen
    // at ingest rate (a handful per minute per feed), and the trigger
    // already does the to_tsvector work whether or not the index
    // exists.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_articles_search_vector"
        ON "articles" USING GIN ("search_vector")
    `);

    // Per-row trigger keeps search_vector in sync. We could use a
    // GENERATED column ("ALWAYS AS ... STORED") on Postgres 12+ but
    // GENERATED columns can't reference each other and the trigger
    // gives us more flexibility (e.g. weighting title vs body via
    // setweight() later) without a schema change.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION articles_search_vector_update()
      RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          to_tsvector('english',
            coalesce(NEW.title, '') || ' ' ||
            coalesce(NEW.summary, '') || ' ' ||
            coalesce(NEW.content_raw, '')
          );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // DROP+CREATE so the migration is idempotent — re-running won't
    // raise on the trigger already existing.
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "articles_search_vector_trigger" ON "articles"`,
    );
    await queryRunner.query(`
      CREATE TRIGGER "articles_search_vector_trigger"
        BEFORE INSERT OR UPDATE OF title, summary, content_raw
        ON "articles"
        FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "articles_search_vector_trigger" ON "articles"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS articles_search_vector_update()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_articles_search_vector"`);
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN IF EXISTS "search_vector"`);
  }
}

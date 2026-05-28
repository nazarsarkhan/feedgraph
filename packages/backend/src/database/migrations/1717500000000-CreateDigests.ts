import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDigests1717500000000 implements MigrationInterface {
  name = 'CreateDigests1717500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Period digests — LLM-generated summaries scoped to (user, period_type,
    // period_start). The unique constraint provides idempotency at the DB
    // layer: DigestsService.generate() checks for an existing row before
    // calling the LLM, but the constraint backstops any race or buggy
    // caller that bypasses the check.
    //
    // period_start is DATE (no time component) so 'day-of' / 'week-starting'
    // / 'month-of' all use the natural calendar bucketing. period_end is
    // also DATE — it's the inclusive last day of the period (for day, it
    // equals period_start; for week, it's period_start + 6; for month, the
    // last day of the month). The articles-window query elsewhere uses
    // `published_at < period_end::date + interval '1 day'` to get full
    // calendar-day coverage including the final day's articles.
    //
    // key_themes and top_entities are JSONB string arrays — same pattern as
    // entities.aliases. Cheap to store, cheap to render, no need for a
    // separate link table at this read frequency.
    await queryRunner.query(`
      CREATE TABLE "digests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "period_type" varchar(10) NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "summary" text NOT NULL,
        "key_themes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "top_entities" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "article_count" integer NOT NULL DEFAULT 0,
        "sentiment" varchar(20),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "digests_period_type_check"
          CHECK ("period_type" IN ('day', 'week', 'month')),
        CONSTRAINT "digests_sentiment_check"
          CHECK ("sentiment" IS NULL OR "sentiment" IN ('positive', 'negative', 'neutral', 'mixed')),
        CONSTRAINT "digests_user_fk" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "digests_user_period_unique"
          UNIQUE ("user_id", "period_type", "period_start")
      )
    `);

    // The unique constraint already produces an index on (user_id,
    // period_type, period_start) — but it's ASC on period_start, and the
    // list endpoint always paginates DESC. A separate index with explicit
    // DESC ordering keeps the latest-digest-first query a single index
    // scan instead of a sort.
    await queryRunner.query(
      `CREATE INDEX "idx_digests_user_period_desc"
         ON "digests" ("user_id", "period_type", "period_start" DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_digests_user_period_desc"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "digests"`);
  }
}

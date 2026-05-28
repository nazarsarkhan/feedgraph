import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPgvector1717700000000 implements MigrationInterface {
  name = 'AddPgvector1717700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // pgvector ships with the `pgvector/pgvector:pg16` image; the
    // CREATE EXTENSION runs against the postgres superuser the env
    // points at (`POSTGRES_USER`). No-op on a re-run.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "vector"`);

    // article_embeddings: one row per processed article, FK CASCADE so
    // a deleted article takes its embedding with it. vector(1536) is
    // the OpenAI text-embedding-3-small dimensionality; same number is
    // emitted by the mock adapter so the column shape doesn't change
    // between providers. `model` is varchar so we can carry future
    // provider/dimension changes (text-embedding-3-large = 3072, etc.)
    // — when that day comes, the new model goes into a separate
    // column or table; today's 1536-only schema keeps the IVFFlat
    // index simple.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "article_embeddings" (
        "article_id" uuid PRIMARY KEY,
        "embedding"  vector(1536) NOT NULL,
        "model"      varchar(64)  NOT NULL DEFAULT 'text-embedding-3-small',
        "created_at" timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "article_embeddings_article_fk" FOREIGN KEY ("article_id")
          REFERENCES "articles" ("id") ON DELETE CASCADE
      )
    `);

    // IVFFlat with vector_cosine_ops — the right opclass for the
    // `<=>` cosine-distance operator we use at query time. lists=100
    // is the recommended starting point per pgvector docs; the
    // recall/speed knob is `ivfflat.probes` at SELECT time (default
    // 1, raise for higher recall). At MVP scale (under a few hundred
    // embeddings) the index makes little difference vs sequential
    // scan, but landing it now means scaling later is "raise probes"
    // not "ALTER TABLE + reindex".
    //
    // Note: pgvector recommends building the IVFFlat index AFTER
    // loading the data for best centroid placement. We accept the
    // empty-build hit here because (a) the table is created empty,
    // (b) the on-demand POST /articles/embed flow can be re-run with
    // REINDEX once a real dataset lands, and (c) the demo's embedding
    // count is small enough that the sequential-scan fallback is
    // sub-millisecond anyway.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_article_embeddings_ivfflat"
        ON "article_embeddings"
        USING ivfflat ("embedding" vector_cosine_ops)
        WITH (lists = 100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_article_embeddings_ivfflat"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "article_embeddings"`);
    // Intentionally NOT dropping the extension — extensions are
    // installation-level state, and another (future) feature might
    // depend on `vector`. Same reasoning as the no-op enum-removal
    // path the prefilter migration follows.
  }
}

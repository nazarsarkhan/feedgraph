import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLlmCacheAndTelemetry1717200000000 implements MigrationInterface {
  name = 'CreateLlmCacheAndTelemetry1717200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Cache keyed by (content_hash, operation, model). No FKs to articles or
    // users — caching is content-derived and we want the cache to survive
    // article/user deletion (a re-import of the same content should still
    // pay zero LLM cost).
    await queryRunner.query(`
      CREATE TABLE "llm_cache" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "content_hash" varchar(64) NOT NULL,
        "operation" varchar(50) NOT NULL,
        "model" varchar(100) NOT NULL,
        "result_json" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "llm_cache_lookup_unique" ON "llm_cache" ("content_hash", "operation", "model")`,
    );

    // Append-only journal of every LLM operation, regardless of cache hit.
    // user_id is nullable + has no FK so telemetry rows survive user
    // deletion for billing/audit; the worker passes user_id when known.
    await queryRunner.query(`
      CREATE TABLE "llm_telemetry" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid,
        "provider" varchar(50) NOT NULL,
        "model" varchar(100) NOT NULL,
        "operation" varchar(50) NOT NULL,
        "prompt_tokens" int NOT NULL DEFAULT 0,
        "completion_tokens" int NOT NULL DEFAULT 0,
        "total_tokens" int NOT NULL DEFAULT 0,
        "cache_hit" boolean NOT NULL DEFAULT false,
        "latency_ms" int NOT NULL DEFAULT 0,
        "success" boolean NOT NULL DEFAULT true,
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "llm_telemetry_created_at_idx" ON "llm_telemetry" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "llm_telemetry_provider_operation_idx" ON "llm_telemetry" ("provider", "operation")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "llm_telemetry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "llm_cache"`);
  }
}

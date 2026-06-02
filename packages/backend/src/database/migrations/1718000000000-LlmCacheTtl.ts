import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an optional expiry to llm_cache rows. NULL means "never expires" (the
 * historical behaviour and the default when LLM_CACHE_TTL_DAYS=0). When the
 * TTL is positive, writes set expires_at = now() + interval and a daily purge
 * job (LlmCachePurgeService) deletes stale rows; reads ignore expired rows.
 */
export class LlmCacheTtl1718000000000 implements MigrationInterface {
  name = 'LlmCacheTtl1718000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "llm_cache" ADD COLUMN "expires_at" timestamptz`);
    // Partial index: only rows with an expiry participate, keeping the purge
    // scan and the read-time filter cheap.
    await queryRunner.query(
      `CREATE INDEX "llm_cache_expires_at_idx" ON "llm_cache" ("expires_at") WHERE "expires_at" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "llm_cache_expires_at_idx"`);
    await queryRunner.query(`ALTER TABLE "llm_cache" DROP COLUMN IF EXISTS "expires_at"`);
  }
}

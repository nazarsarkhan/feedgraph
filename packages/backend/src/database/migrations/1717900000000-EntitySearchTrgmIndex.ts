import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a pg_trgm GIN index on lower(canonical_name) so the entity-list
 * substring search (`lower(canonical_name) LIKE lower('%q%')`) is index-backed
 * instead of a sequential scan. The existing
 * entities_user_lower_name_type_unique index only helps exact dedup lookups,
 * not substring matches.
 */
export class EntitySearchTrgmIndex1717900000000 implements MigrationInterface {
  name = 'EntitySearchTrgmIndex1717900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `CREATE INDEX "entities_canonical_name_trgm_idx" ON "entities" USING GIN (lower("canonical_name") gin_trgm_ops)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "entities_canonical_name_trgm_idx"`);
    // Leave the pg_trgm extension installed — other indexes may rely on it and
    // dropping a shared extension on a single migration's down() is unsafe.
  }
}

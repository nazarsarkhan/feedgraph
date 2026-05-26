import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrefilterFieldsToArticles1717100000000 implements MigrationInterface {
  name = 'AddPrefilterFieldsToArticles1717100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres 12+ permits ALTER TYPE ADD VALUE inside a transaction block;
    // the new value just isn't usable inside the same transaction. We do not
    // reference 'pending_llm' anywhere else in this migration, so the default
    // TypeORM migration transaction is safe. IF NOT EXISTS makes the
    // statement idempotent on re-run.
    await queryRunner.query(
      `ALTER TYPE "articles_status_enum" ADD VALUE IF NOT EXISTS 'pending_llm' BEFORE 'processed'`,
    );
    await queryRunner.query(`ALTER TABLE "articles" ADD COLUMN "filter_reason" varchar(64)`);
    // Indexed because the prefilter worker and UI list both filter by status.
    await queryRunner.query(`CREATE INDEX "articles_status_idx" ON "articles" ("status")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "articles_status_idx"`);
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN IF EXISTS "filter_reason"`);
    // Removing an enum value in Postgres requires recreating the type and
    // rewriting every dependent column. We intentionally leave 'pending_llm'
    // in the enum on down — this migration is a one-way enum addition. If a
    // true rollback is ever needed, write a follow-up migration that
    // recreates "articles_status_enum" with the original four values.
  }
}

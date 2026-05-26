import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeedsTable1716800000000 implements MigrationInterface {
  name = 'CreateFeedsTable1716800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "feeds_status_enum" AS ENUM ('active', 'paused', 'error')`,
    );
    await queryRunner.query(`
      CREATE TABLE "feeds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "url" varchar(2048) NOT NULL,
        "name" varchar(255),
        "status" "feeds_status_enum" NOT NULL DEFAULT 'active',
        "last_polled_at" timestamptz,
        "last_error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "feeds_user_fk" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "feeds_user_id_idx" ON "feeds" ("user_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "feeds_user_url_unique" ON "feeds" ("user_id", "url")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "feeds_user_url_unique"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "feeds_user_id_idx"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feeds"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "feeds_status_enum"`);
  }
}

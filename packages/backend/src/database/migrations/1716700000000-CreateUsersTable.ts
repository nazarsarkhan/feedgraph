import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1716700000000 implements MigrationInterface {
  name = 'CreateUsersTable1716700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL,
        "password_hash" varchar NOT NULL,
        "email_confirmed_at" timestamptz,
        "email_confirmation_token" varchar(128),
        "email_confirmation_expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "users_email_unique"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}

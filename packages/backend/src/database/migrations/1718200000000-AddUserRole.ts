import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds users.role, a real Postgres enum ('user' | 'admin'). The column is NOT
 * NULL with a 'user' default, so every existing row is backfilled to 'user' in
 * the same statement — no separate UPDATE needed. Admin is granted explicitly
 * (the demo seed plants one); there is no self-service path to it.
 *
 * The type name (users_role_enum) matches TypeORM's default derivation
 * ({table}_{column}_enum) for the @Column({ type: 'enum' }) on User.role, the
 * same convention articles_filter_reason_enum follows.
 */
export class AddUserRole1718200000000 implements MigrationInterface {
  name = 'AddUserRole1718200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "users_role_enum" AS ENUM ('user', 'admin')`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "role" "users_role_enum" NOT NULL DEFAULT 'user'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}

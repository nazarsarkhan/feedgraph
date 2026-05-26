import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoriesAndAxes1716900000000 implements MigrationInterface {
  name = 'CreateCategoriesAndAxes1716900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "categories_user_fk" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "categories_user_id_idx" ON "categories" ("user_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "categories_user_name_unique" ON "categories" ("user_id", "name")`,
    );

    await queryRunner.query(`
      CREATE TABLE "axes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "axes_user_fk" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "axes_user_id_idx" ON "axes" ("user_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "axes_user_name_unique" ON "axes" ("user_id", "name")`,
    );

    await queryRunner.query(`
      CREATE TABLE "axis_values" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "axis_id" uuid NOT NULL,
        "value" varchar(100) NOT NULL,
        "position" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "axis_values_axis_fk" FOREIGN KEY ("axis_id")
          REFERENCES "axes" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "axis_values_axis_id_idx" ON "axis_values" ("axis_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "axis_values_axis_value_unique" ON "axis_values" ("axis_id", "value")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "axis_values"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "axes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
  }
}

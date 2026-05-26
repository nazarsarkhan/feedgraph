import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArticlesTable1717000000000 implements MigrationInterface {
  name = 'CreateArticlesTable1717000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "articles_status_enum" AS ENUM ('raw', 'filtered', 'processed', 'error')`,
    );
    await queryRunner.query(`
      CREATE TABLE "articles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "feed_id" uuid,
        "url" varchar(2048) NOT NULL,
        "url_normalized" varchar(2048) NOT NULL,
        "content_hash" varchar(64) NOT NULL,
        "guid" varchar(512),
        "title" text,
        "summary_raw" text,
        "content_raw" text,
        "author" varchar(255),
        "published_at" timestamptz,
        "status" "articles_status_enum" NOT NULL DEFAULT 'raw',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "articles_user_fk" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "articles_feed_fk" FOREIGN KEY ("feed_id")
          REFERENCES "feeds" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "articles_user_id_idx" ON "articles" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "articles_feed_id_idx" ON "articles" ("feed_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "articles_user_url_normalized_unique" ON "articles" ("user_id", "url_normalized")`,
    );
    await queryRunner.query(
      `CREATE INDEX "articles_user_content_hash_idx" ON "articles" ("user_id", "content_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "articles_published_at_idx" ON "articles" ("published_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "articles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "articles_status_enum"`);
  }
}

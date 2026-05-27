import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEntitiesAndArticleLinks1717300000000 implements MigrationInterface {
  name = 'CreateEntitiesAndArticleLinks1717300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "entities_type_enum" AS ENUM ('person', 'company', 'product', 'technology', 'location')`,
    );
    // 'junk' is intentionally NOT here — junk articles land in status='filtered'
    // with filter_reason='llm_junk', so the importance column only holds the
    // values that mean "article was kept after LLM review".
    await queryRunner.query(`CREATE TYPE "articles_importance_enum" AS ENUM ('high', 'normal')`);

    await queryRunner.query(`
      CREATE TABLE "entities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "canonical_name" varchar(200) NOT NULL,
        "type" "entities_type_enum" NOT NULL,
        "aliases" jsonb NOT NULL DEFAULT '[]',
        "description" text,
        "first_seen" timestamptz NOT NULL DEFAULT now(),
        "last_seen" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "entities_user_fk" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "entities_user_id_idx" ON "entities" ("user_id")`);
    // Deterministic-dedup key. lower(canonical_name) so 'Cloudflare' and
    // 'cloudflare' from successive RSS items collapse to one entity row.
    // The LLM fuzzy match step (matchEntities) lays on top of this.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "entities_user_lower_name_type_unique" ON "entities" ("user_id", lower("canonical_name"), "type")`,
    );

    // Composite-PK link tables — pure many-to-many edges, no surrogate id.
    // ON DELETE CASCADE both sides so removing either parent cleans up.
    await queryRunner.query(`
      CREATE TABLE "article_entities" (
        "article_id" uuid NOT NULL,
        "entity_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("article_id", "entity_id"),
        CONSTRAINT "article_entities_article_fk" FOREIGN KEY ("article_id")
          REFERENCES "articles" ("id") ON DELETE CASCADE,
        CONSTRAINT "article_entities_entity_fk" FOREIGN KEY ("entity_id")
          REFERENCES "entities" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "article_entities_entity_id_idx" ON "article_entities" ("entity_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "article_categories" (
        "article_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("article_id", "category_id"),
        CONSTRAINT "article_categories_article_fk" FOREIGN KEY ("article_id")
          REFERENCES "articles" ("id") ON DELETE CASCADE,
        CONSTRAINT "article_categories_category_fk" FOREIGN KEY ("category_id")
          REFERENCES "categories" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "article_categories_category_id_idx" ON "article_categories" ("category_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "article_axis_values" (
        "article_id" uuid NOT NULL,
        "axis_value_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("article_id", "axis_value_id"),
        CONSTRAINT "article_axis_values_article_fk" FOREIGN KEY ("article_id")
          REFERENCES "articles" ("id") ON DELETE CASCADE,
        CONSTRAINT "article_axis_values_value_fk" FOREIGN KEY ("axis_value_id")
          REFERENCES "axis_values" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "article_axis_values_value_id_idx" ON "article_axis_values" ("axis_value_id")`,
    );

    // LLM-derived fields on the article itself. summary is distinct from
    // summaryRaw (which came from the RSS feed); importance is null when the
    // article was rejected as junk by the LLM (it lands in status=filtered).
    await queryRunner.query(`ALTER TABLE "articles" ADD COLUMN "summary" text`);
    await queryRunner.query(
      `ALTER TABLE "articles" ADD COLUMN "importance" "articles_importance_enum"`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN IF EXISTS "importance"`);
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN IF EXISTS "summary"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "article_axis_values"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "article_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "article_entities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "entities"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "articles_importance_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "entities_type_enum"`);
  }
}

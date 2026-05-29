import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Promotes articles.filter_reason from a free-form varchar(64) to a real
 * Postgres enum. The value set is closed: the four PREFILTER_RULES names plus
 * 'llm_junk' (the LLM-junk verdict). Any future reason must be added here AND
 * to the enum via a follow-up ALTER TYPE ADD VALUE migration, which makes an
 * invalid reason fail at the DB layer instead of silently becoming a typo.
 */
export class FilterReasonEnum1717800000000 implements MigrationInterface {
  name = 'FilterReasonEnum1717800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "articles_filter_reason_enum" AS ENUM ('missing_title', 'content_too_short', 'clickbait_title', 'high_link_density', 'llm_junk')`,
    );
    // USING cast rewrites existing rows. The only writers of filter_reason are
    // PREFILTER_RULES + 'llm_junk', so every existing value is in the enum and
    // the cast cannot fail. NULLs (the common case) pass through unchanged.
    await queryRunner.query(
      `ALTER TABLE "articles" ALTER COLUMN "filter_reason" TYPE "articles_filter_reason_enum" USING "filter_reason"::"articles_filter_reason_enum"`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "articles" ALTER COLUMN "filter_reason" TYPE varchar(64) USING "filter_reason"::text`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "articles_filter_reason_enum"`);
  }
}

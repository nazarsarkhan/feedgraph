import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Materialized view of entity co-mention pairs, replacing the on-the-fly
 * article_entities self-join used by the graph co_mention edges and the
 * entity-detail related-entities list. Each unordered pair {a,b} is stored
 * once with a < b (entity_a_id < entity_b_id), its co-mention weight, and the
 * earliest published_at across the shared articles (epoch seconds, for the
 * graph timeline). Refreshed CONCURRENTLY by CoMentionViewService after writes
 * and on a safety-net cron — hence the UNIQUE index, which CONCURRENTLY needs.
 */
export class CreateEntityCoMentionsMatview1718100000000 implements MigrationInterface {
  name = 'CreateEntityCoMentionsMatview1718100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "entity_co_mentions" AS
      SELECT
        ae1.entity_id AS entity_a_id,
        ae2.entity_id AS entity_b_id,
        count(*)::int AS weight,
        EXTRACT(EPOCH FROM min(a.published_at))::int AS min_published_at
      FROM article_entities ae1
      INNER JOIN article_entities ae2
        ON ae2.article_id = ae1.article_id
        AND ae2.entity_id > ae1.entity_id
      INNER JOIN articles a ON a.id = ae1.article_id
      GROUP BY ae1.entity_id, ae2.entity_id
      WITH DATA
    `);
    // UNIQUE index is mandatory for REFRESH MATERIALIZED VIEW CONCURRENTLY.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "entity_co_mentions_pair_uidx" ON "entity_co_mentions" ("entity_a_id", "entity_b_id")`,
    );
    // Single-column indexes back the directional lookups in
    // loadRelatedEntities (entity_a_id = $1 OR entity_b_id = $1).
    await queryRunner.query(
      `CREATE INDEX "entity_co_mentions_a_idx" ON "entity_co_mentions" ("entity_a_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "entity_co_mentions_b_idx" ON "entity_co_mentions" ("entity_b_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS "entity_co_mentions"`);
  }
}

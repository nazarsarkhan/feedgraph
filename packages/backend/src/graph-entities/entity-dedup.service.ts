import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { MatchEntitiesInput } from '@feedgraph/shared';
import { DataSource, type EntityManager } from 'typeorm';
import { LlmService } from '../llm/llm.service';
import type { GraphEntityType } from './graph-entity.entity';

/**
 * On-demand fuzzy entity deduplication. Multi-tenant contract: every
 * method takes userId as the first param and every DB write filters by
 * user_id. The LLM call is per-user (one batch of one user's entities)
 * so cross-tenant leakage is impossible at the input layer; we also
 * validate every id the LLM returns against the user's set before any
 * write (defence in depth — a misbehaving model that hallucinates an
 * id-from-another-user can't smuggle a merge through).
 *
 * Runs synchronously on the request thread by design (per-call cost is
 * one LLM round-trip, proportional to entity count). Triggered by
 * POST /entities/deduplicate; not enqueued via BullMQ — see ADR.
 */
@Injectable()
export class EntityDedupService {
  private readonly logger = new Logger(EntityDedupService.name);

  // LLM context budget. The matchEntities prompt embeds the full
  // entity list as JSON, so we cap the per-call entity count to keep
  // the prompt well under any model's context window. At ~200 entities
  // each with id + name + type + aliases, the prompt is roughly 30-50KB
  // of text — comfortable for both OpenAI and Anthropic.
  private static readonly MAX_ENTITIES_PER_CALL = 200;
  private static readonly CONFIDENCE_THRESHOLD = 0.8;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly llm: LlmService,
  ) {}

  async deduplicateForUser(userId: string): Promise<{
    entitiesConsidered: number;
    groupsFound: number;
    entitiesMerged: number;
  }> {
    // Load all this user's entities, ordered so the most-mentioned
    // appears first within each (type, normalized-name) group. The
    // LLM prompt + the mock both treat the first entry as the natural
    // canonical pick when groups tie, so this ordering matters.
    const rows = (await this.dataSource.query(
      `SELECT e.id, e.canonical_name, e.type, e.aliases,
              (SELECT count(*) FROM article_entities ae WHERE ae.entity_id = e.id) AS mention_count
       FROM entities e
       WHERE e.user_id = $1
       ORDER BY (SELECT count(*) FROM article_entities ae WHERE ae.entity_id = e.id) DESC NULLS LAST,
                e.created_at ASC`,
      [userId],
    )) as Array<{
      id: string;
      canonical_name: string;
      type: GraphEntityType;
      aliases: string[] | null;
      mention_count: string;
    }>;

    if (rows.length < 2) {
      return { entitiesConsidered: rows.length, groupsFound: 0, entitiesMerged: 0 };
    }

    const chunk = rows.slice(0, EntityDedupService.MAX_ENTITIES_PER_CALL);
    if (rows.length > chunk.length) {
      this.logger.warn(
        `dedup: user=${userId} has ${rows.length} entities, capping LLM input at ${chunk.length}`,
      );
    }

    const input: MatchEntitiesInput = {
      entities: chunk.map((r) => ({
        id: r.id,
        canonicalName: r.canonical_name,
        type: r.type,
        aliases: r.aliases ?? [],
      })),
    };

    const llmResult = await this.llm.matchEntities(input, userId);

    // Validate every returned id is in the user's own set. The set is
    // derived from rows (the input) so even if the LLM hallucinates an
    // id from another tenant, it gets filtered out here before any DB
    // write. Also rejects groups that include canonicalId in
    // duplicateIds (self-merge) and empty-duplicates groups.
    const validIds = new Set(rows.map((r) => r.id));
    const validGroups = llmResult.mergeGroups.filter((g) => {
      if (g.confidence < EntityDedupService.CONFIDENCE_THRESHOLD) return false;
      if (g.duplicateIds.length === 0) return false;
      if (!validIds.has(g.canonicalId)) return false;
      if (g.duplicateIds.includes(g.canonicalId)) return false;
      for (const d of g.duplicateIds) {
        if (!validIds.has(d)) return false;
      }
      return true;
    });

    // Belt-and-suspenders: an LLM can return overlapping groups (e.g.
    // entity X listed as a duplicate in group A AND as canonical in
    // group B). Pre-flight a "claim" pass so we never double-merge a
    // single id — first group to mention it wins.
    const claimed = new Set<string>();
    const safeGroups: typeof validGroups = [];
    for (const g of validGroups) {
      if (claimed.has(g.canonicalId)) continue;
      if (g.duplicateIds.some((d) => claimed.has(d))) continue;
      claimed.add(g.canonicalId);
      for (const d of g.duplicateIds) claimed.add(d);
      safeGroups.push(g);
    }

    if (safeGroups.length === 0) {
      this.logger.log(
        `dedup: user=${userId} considered=${rows.length} llm_groups=${llmResult.mergeGroups.length} valid_groups=0 — no merges to perform`,
      );
      return { entitiesConsidered: rows.length, groupsFound: 0, entitiesMerged: 0 };
    }

    let totalMerged = 0;
    await this.dataSource.transaction(async (manager) => {
      for (const group of safeGroups) {
        totalMerged += await this.mergeGroup(manager, userId, group);
      }
    });

    this.logger.log(
      `dedup: user=${userId} considered=${rows.length} groups_found=${safeGroups.length} entities_merged=${totalMerged}`,
    );
    return {
      entitiesConsidered: rows.length,
      groupsFound: safeGroups.length,
      entitiesMerged: totalMerged,
    };
  }

  /**
   * Merge one group inside the caller's transaction. Three writes:
   *
   * 1. For every article that links to ANY duplicate, INSERT a link from
   *    that article to the canonical. ON CONFLICT DO NOTHING handles
   *    two overlap cases atomically — without it both would raise on
   *    the composite PK (article_id, entity_id):
   *      (a) "article already linked to canonical": canonical's existing
   *          row stays untouched, the new INSERT is skipped.
   *      (b) "two siblings link to the same article": the first sibling
   *          inserts (article, canonical) and the second's INSERT is
   *          skipped — without this an `UPDATE … SET entity_id =
   *          canonical` approach would raise on the second sibling.
   *
   * 2. DELETE every article_entities row for the duplicates. After
   *    step 1 every duplicate's article has a canonical link, so the
   *    DELETE doesn't lose data.
   *
   * 3. UPDATE the canonical's aliases JSONB, then DELETE the duplicate
   *    entity rows. The DELETE re-filters by user_id as defence in
   *    depth — `validIds` already gated to the caller's set, but a
   *    logic regression above must not be able to touch another
   *    tenant's rows.
   */
  private async mergeGroup(
    manager: EntityManager,
    userId: string,
    group: {
      canonicalId: string;
      duplicateIds: string[];
      aliases: string[];
    },
  ): Promise<number> {
    // Dedup the duplicate id array — the LLM occasionally emits the same
    // id twice in one group, which is harmless for ANY() matching but
    // makes the totalMerged accounting wrong if we accidentally trust
    // the array's raw length anywhere.
    const uniqueDuplicateIds = [...new Set(group.duplicateIds)];

    await manager.query(
      `INSERT INTO article_entities (article_id, entity_id)
       SELECT DISTINCT article_id, $1::uuid
       FROM article_entities
       WHERE entity_id = ANY($2::uuid[])
       ON CONFLICT (article_id, entity_id) DO NOTHING`,
      [group.canonicalId, uniqueDuplicateIds],
    );

    await manager.query(`DELETE FROM article_entities WHERE entity_id = ANY($1::uuid[])`, [
      uniqueDuplicateIds,
    ]);

    await manager.query(`UPDATE entities SET aliases = $1::jsonb WHERE id = $2`, [
      JSON.stringify(group.aliases),
      group.canonicalId,
    ]);

    // TypeORM's manager.query() returns [rows, rowCount] as a tuple for
    // any INSERT/UPDATE/DELETE that has a RETURNING clause (the pg driver
    // wraps the result this way). The rows live at index 0; treating the
    // tuple as a flat array of rows would always read `length === 2`.
    const [deletedRows] = (await manager.query(
      `DELETE FROM entities WHERE id = ANY($1::uuid[]) AND user_id = $2 RETURNING id`,
      [uniqueDuplicateIds, userId],
    )) as [Array<{ id: string }>, number];

    return deletedRows.length;
  }
}

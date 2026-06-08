import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { MatchEntitiesInput, MatchEntitiesOutput } from '@feedgraph/shared';
import { Queue } from 'bullmq';
import { DataSource, type EntityManager } from 'typeorm';
import type { Env } from '../config/env.schema';
import { LlmService } from '../llm/llm.service';
import { QUEUE_NAMES } from '../queue/queue-names';
import { CoMentionViewService } from './co-mention-view.service';
import type { GraphEntityType } from './graph-entity.entity';

// One entity row as loaded from Postgres for the dedup pass.
export interface DedupEntityRow {
  id: string;
  canonical_name: string;
  type: GraphEntityType;
  aliases: string[] | null;
  mention_count: string;
}

// A validated, claim-checked merge instruction ready to apply in a transaction.
export interface PlannedMergeGroup {
  canonicalId: string;
  duplicateIds: string[];
  aliases: string[];
}

export interface DedupResult {
  entitiesConsidered: number;
  groupsFound: number;
  entitiesMerged: number;
  batches: number;
}

// Live progress written to the BullMQ job so the frontend can poll it.
export interface DedupProgress {
  processedEntities: number;
  totalEntities: number;
  batchesDone: number;
  totalBatches: number;
  groupsFound: number;
  entitiesMerged: number;
}

// BullMQ JobState plus 'unknown' (a removed/evicted job).
export type DedupJobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'
  | 'waiting-children'
  | 'prioritized'
  | 'unknown';

export interface DedupJobStatus {
  jobId: string;
  state: DedupJobState;
  progress: DedupProgress | null;
  result: DedupResult | null;
  error: string | null;
}

export interface DedupJobData {
  userId: string;
}

/**
 * Split a row list into fixed-size batches. Pure; exported for unit tests.
 */
export function chunkEntities<T>(rows: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive');
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size));
  }
  return out;
}

/**
 * Validate the LLM's merge groups against the batch's own id set and a
 * confidence floor, then run a single "claim" pass so no id is touched by
 * two groups. Pure; exported for unit tests.
 *
 * `validIds` MUST be derived from the entities actually sent to the LLM in
 * this batch — a returned id outside the set (hallucination, or a row from
 * another tenant) is dropped here before any DB write.
 */
export function planMergeGroups(
  validIds: ReadonlySet<string>,
  groups: MatchEntitiesOutput['mergeGroups'],
  minConfidence: number,
): PlannedMergeGroup[] {
  const valid = groups.filter((g) => {
    if (g.confidence < minConfidence) return false;
    if (g.duplicateIds.length === 0) return false;
    if (!validIds.has(g.canonicalId)) return false;
    if (g.duplicateIds.includes(g.canonicalId)) return false;
    for (const d of g.duplicateIds) {
      if (!validIds.has(d)) return false;
    }
    return true;
  });

  // An LLM can return overlapping groups (entity X listed as a duplicate in
  // group A and as canonical in group B). First group to mention an id wins;
  // any later group that reuses a claimed id is dropped wholesale.
  const claimed = new Set<string>();
  const safe: PlannedMergeGroup[] = [];
  for (const g of valid) {
    if (claimed.has(g.canonicalId)) continue;
    if (g.duplicateIds.some((d) => claimed.has(d))) continue;
    claimed.add(g.canonicalId);
    for (const d of g.duplicateIds) claimed.add(d);
    safe.push({ canonicalId: g.canonicalId, duplicateIds: g.duplicateIds, aliases: g.aliases });
  }
  return safe;
}

/**
 * On-demand fuzzy entity deduplication. Multi-tenant contract: every method
 * takes userId as the first param and every DB write filters by user_id. The
 * LLM call is per-user (one batch of one user's entities) so cross-tenant
 * leakage is impossible at the input layer; we also validate every id the LLM
 * returns against the batch set before any write (defence in depth).
 *
 * The work runs ASYNCHRONOUSLY on the ENTITY_DEDUP BullMQ queue — see ADR.
 * POST /entities/deduplicate enqueues a job (202 + jobId); the worker calls
 * runForUser, which walks the entity set in batches. The HTTP layer never
 * blocks on an LLM round-trip.
 */
@Injectable()
export class EntityDedupService {
  private readonly logger = new Logger(EntityDedupService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly llm: LlmService,
    private readonly config: ConfigService<Env, true>,
    private readonly coMentionView: CoMentionViewService,
    @InjectQueue(QUEUE_NAMES.ENTITY_DEDUP) private readonly dedupQueue: Queue<DedupJobData>,
  ) {}

  /**
   * Enqueue a dedup job for the user and return its id. One in-flight job per
   * user: if a dedup is already queued or running we return its id rather than
   * stacking a second pass over the same (mutating) entity set.
   */
  async enqueueForUser(userId: string): Promise<{ jobId: string }> {
    const existing = await this.findActiveJobForUser(userId);
    if (existing?.id) {
      this.logger.log(`dedup: user=${userId} already has in-flight job=${existing.id}`);
      return { jobId: existing.id };
    }

    const job = await this.dedupQueue.add(
      'deduplicate',
      { userId },
      {
        // attempts:1 — a dedup is not safely auto-retried as a single unit:
        // completed batches have already committed, so a silent retry would
        // re-walk a partially-merged set. We surface failure to the user
        // instead; they can click again (re-running is idempotent on the
        // fresh set). removeOn* keeps the job queryable for status polling
        // for an hour, then BullMQ evicts it.
        attempts: 1,
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 3600, count: 100 },
      },
    );
    if (!job.id) {
      // BullMQ always assigns an id; this guards the type, not reality.
      throw new Error('dedup job enqueued without an id');
    }
    this.logger.log(`dedup: user=${userId} enqueued job=${job.id}`);
    return { jobId: job.id };
  }

  /**
   * Status of a dedup job for polling. Tenant isolation: an unknown job and
   * another user's job both surface as 404 — we never acknowledge that another
   * tenant's job exists (the project-wide cross-tenant convention).
   */
  async getJobStatus(userId: string, jobId: string): Promise<DedupJobStatus> {
    const job = await this.dedupQueue.getJob(jobId);
    if (!job || job.data?.userId !== userId) {
      throw new NotFoundException('dedup job not found');
    }

    const state = (await job.getState()) as DedupJobState;
    const progress =
      job.progress && typeof job.progress === 'object'
        ? (job.progress as unknown as DedupProgress)
        : null;
    const result =
      state === 'completed' && job.returnvalue ? (job.returnvalue as unknown as DedupResult) : null;
    const error = state === 'failed' ? (job.failedReason ?? 'dedup job failed') : null;

    return { jobId, state, progress, result, error };
  }

  /**
   * The actual dedup pass, invoked by the ENTITY_DEDUP worker. Loads the
   * user's full entity set, walks it in batches, and for each batch runs one
   * matchEntities call + a merge transaction. Progress is reported per batch
   * via onProgress (the worker forwards it to job.updateProgress).
   *
   * Batches are disjoint id sets, so a merge in one batch never deletes a row
   * referenced by another — each entity is considered exactly once. The
   * trade-off is that two duplicates landing in different batches won't be
   * collapsed in a single pass; ordering clusters likely-duplicates (same
   * type, then most-mentioned first) to minimise this. See ADR.
   */
  async runForUser(
    userId: string,
    onProgress: (p: DedupProgress) => Promise<void> | void,
  ): Promise<DedupResult> {
    const rows = await this.loadEntities(userId);
    const batchSize = this.config.get('ENTITY_DEDUP_BATCH_SIZE', { infer: true });
    const batches = chunkEntities(rows, batchSize);
    const minConfidence = this.config.get('ENTITY_DEDUP_MIN_CONFIDENCE', { infer: true });

    let processedEntities = 0;
    let groupsFound = 0;
    let entitiesMerged = 0;

    // Emit totals up front so a fast first poll sees the denominator before
    // batch 1's LLM call returns.
    await onProgress({
      processedEntities: 0,
      totalEntities: rows.length,
      batchesDone: 0,
      totalBatches: batches.length,
      groupsFound: 0,
      entitiesMerged: 0,
    });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchResult = await this.processBatch(userId, batch, minConfidence);
      processedEntities += batch.length;
      groupsFound += batchResult.groupsFound;
      entitiesMerged += batchResult.entitiesMerged;
      await onProgress({
        processedEntities,
        totalEntities: rows.length,
        batchesDone: i + 1,
        totalBatches: batches.length,
        groupsFound,
        entitiesMerged,
      });
    }

    // Merges re-point article_entities, changing co-mention pairs — refresh the
    // materialized view (fire-and-forget; the view also has a cron net).
    if (entitiesMerged > 0) {
      void this.coMentionView.requestRefresh();
    }

    this.logger.log(
      `dedup: user=${userId} considered=${rows.length} batches=${batches.length} groups_found=${groupsFound} entities_merged=${entitiesMerged}`,
    );

    return {
      entitiesConsidered: rows.length,
      groupsFound,
      entitiesMerged,
      batches: batches.length,
    };
  }

  private async findActiveJobForUser(userId: string) {
    const jobs = await this.dedupQueue.getJobs(['active', 'waiting', 'delayed', 'paused']);
    return jobs.find((j) => j.data?.userId === userId) ?? null;
  }

  // Load all of a user's entities, ordered to cluster likely-duplicates into
  // the same batch: same type adjacent, and within that the most-mentioned
  // first (so it tends to be the canonical pick when the LLM ties a group).
  private async loadEntities(userId: string): Promise<DedupEntityRow[]> {
    return (await this.dataSource.query(
      `SELECT e.id, e.canonical_name, e.type, e.aliases,
              (SELECT count(*) FROM article_entities ae WHERE ae.entity_id = e.id) AS mention_count
       FROM entities e
       WHERE e.user_id = $1
       ORDER BY e.type ASC,
                (SELECT count(*) FROM article_entities ae WHERE ae.entity_id = e.id) DESC NULLS LAST,
                e.created_at ASC`,
      [userId],
    )) as DedupEntityRow[];
  }

  private async processBatch(
    userId: string,
    batch: DedupEntityRow[],
    minConfidence: number,
  ): Promise<{ groupsFound: number; entitiesMerged: number }> {
    if (batch.length < 2) {
      return { groupsFound: 0, entitiesMerged: 0 };
    }

    const input: MatchEntitiesInput = {
      entities: batch.map((r) => ({
        id: r.id,
        canonicalName: r.canonical_name,
        type: r.type,
        aliases: r.aliases ?? [],
      })),
    };

    const llmResult = await this.llm.matchEntities(input, userId);
    const validIds = new Set(batch.map((r) => r.id));
    const safeGroups = planMergeGroups(validIds, llmResult.mergeGroups, minConfidence);

    if (safeGroups.length === 0) {
      return { groupsFound: 0, entitiesMerged: 0 };
    }

    let entitiesMerged = 0;
    await this.dataSource.transaction(async (manager) => {
      for (const group of safeGroups) {
        entitiesMerged += await this.mergeGroup(manager, userId, group);
      }
    });
    return { groupsFound: safeGroups.length, entitiesMerged };
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
   *    depth — `validIds` already gated to the batch's set, but a logic
   *    regression above must not be able to touch another tenant's rows.
   */
  private async mergeGroup(
    manager: EntityManager,
    userId: string,
    group: PlannedMergeGroup,
  ): Promise<number> {
    // Dedup the duplicate id array — the LLM occasionally emits the same id
    // twice in one group, which is harmless for ANY() matching but makes the
    // merge accounting wrong if we trust the array's raw length anywhere.
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

    // TypeORM's manager.query() returns [rows, rowCount] as a tuple for any
    // INSERT/UPDATE/DELETE with a RETURNING clause (the pg driver wraps it).
    // The rows live at index 0; treating the tuple as a flat array of rows
    // would always read `length === 2`.
    const [deletedRows] = (await manager.query(
      `DELETE FROM entities WHERE id = ANY($1::uuid[]) AND user_id = $2 RETURNING id`,
      [uniqueDuplicateIds, userId],
    )) as [Array<{ id: string }>, number];

    return deletedRows.length;
  }
}

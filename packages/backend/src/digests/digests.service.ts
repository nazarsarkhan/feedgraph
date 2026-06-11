import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { LlmService } from '../llm/llm.service';
import { QUEUE_NAMES } from '../queue/queue-names';
import { Digest, type DigestPeriodType } from './digest.entity';

// BullMQ JobState plus 'unknown' (a removed/evicted job). Mirrors the
// entity-dedup status contract so the frontend polls digests the same way.
export type DigestJobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'
  | 'waiting-children'
  | 'prioritized'
  | 'unknown';

export interface DigestJobData {
  userId: string;
  periodType: DigestPeriodType;
  // The caller's free-form date inside the period; the worker recomputes the
  // canonical bounds from it via generate().
  date: string;
  // Canonical period start (YYYY-MM-DD) — the single-flight match key, so a
  // second request for any date in the same period joins the in-flight job
  // rather than stacking a duplicate generation.
  periodStart: string;
}

export interface DigestJobStatus {
  jobId: string;
  state: DigestJobState;
  result: Digest | null;
  error: string | null;
}

// POST /digests/generate either returns the already-stored digest (no LLM, no
// queue) or enqueues a job and returns its id. Discriminated so the controller
// picks the HTTP status (200 vs 202) and the frontend branches on the shape.
export type DigestGenerateResult =
  | { status: 'existing'; digest: Digest }
  | { status: 'enqueued'; jobId: string };

/**
 * Multi-tenant contract: every method takes userId as the first param and
 * every query filters by user_id. Cross-tenant access (findOne / getJobStatus
 * with a mismatched userId) returns 404 — never 403 — per the project rule.
 *
 * Generation runs ASYNCHRONOUSLY on the DIGEST BullMQ queue — see ADR.
 * POST /digests/generate short-circuits to the stored row if one exists
 * (no LLM), otherwise enqueues a job (202 + jobId) whose worker calls
 * generate(); the HTTP layer never blocks on the buildDigest round-trip.
 *
 * Generation is idempotent on (user_id, period_type, period_start). The
 * service checks for an existing row BEFORE calling the LLM so identical
 * re-runs cost nothing. The DB unique index backstops the check (if a
 * race ever inserts a duplicate, the second insert fails and we return
 * the row that won).
 */
@Injectable()
export class DigestsService {
  private readonly logger = new Logger(DigestsService.name);

  // Mirror the prompt-side cap. SQL fetches only this many rows so
  // SELECTs stay bounded even on long backfill periods.
  private static readonly MAX_ARTICLES_PER_DIGEST = 50;
  // Hard cap on list endpoint — same shape as the entities page; if the
  // user generates more than this we can paginate later.
  private static readonly LIST_LIMIT = 30;

  constructor(
    @InjectRepository(Digest) private readonly repo: Repository<Digest>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly llm: LlmService,
    @InjectQueue(QUEUE_NAMES.DIGEST) private readonly digestQueue: Queue<DigestJobData>,
  ) {}

  /**
   * Resolve a generate request: return the stored digest if it exists (fast
   * path — no LLM, no queue), otherwise enqueue a DIGEST job and return its id.
   * Single-flight per (user, period): a second request for any date in the
   * same period joins the in-flight job instead of enqueuing a duplicate.
   */
  async enqueueOrGet(
    userId: string,
    periodType: DigestPeriodType,
    date: string,
  ): Promise<DigestGenerateResult> {
    // computePeriodBounds throws BadRequest on a malformed date — so a bad
    // date still fails synchronously at the HTTP layer, before any enqueue.
    const { periodStart } = computePeriodBounds(periodType, date);

    const existing = await this.repo.findOne({
      where: { userId, periodType, periodStart },
    });
    if (existing) {
      this.logger.log(
        `digest reuse user=${userId} period=${periodType}/${periodStart} id=${existing.id}`,
      );
      return { status: 'existing', digest: existing };
    }

    const inflight = await this.findActiveJob(userId, periodType, periodStart);
    if (inflight?.id) {
      this.logger.log(
        `digest: user=${userId} period=${periodType}/${periodStart} already in-flight job=${inflight.id}`,
      );
      return { status: 'enqueued', jobId: inflight.id };
    }

    const job = await this.digestQueue.add(
      'generate',
      { userId, periodType, date, periodStart },
      {
        // attempts:1 — generation is idempotent (existence check + unique
        // constraint), so we surface failure to the user rather than silently
        // retrying; the most common failure is an empty period (a user-input
        // issue a retry can't fix). removeOn* keeps the job queryable for
        // status polling for an hour, then BullMQ evicts it.
        attempts: 1,
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 3600, count: 100 },
      },
    );
    if (!job.id) {
      // BullMQ always assigns an id; this guards the type, not reality.
      throw new Error('digest job enqueued without an id');
    }
    this.logger.log(
      `digest: user=${userId} period=${periodType}/${periodStart} enqueued job=${job.id}`,
    );
    return { status: 'enqueued', jobId: job.id };
  }

  /**
   * Status of a digest job for polling. Tenant isolation: an unknown job and
   * another user's job both surface as 404 (the project-wide
   * don't-acknowledge-existence convention). On completion `result` carries
   * the generated Digest (BullMQ's JSON-serialized return value).
   */
  async getJobStatus(userId: string, jobId: string): Promise<DigestJobStatus> {
    const job = await this.digestQueue.getJob(jobId);
    if (!job || job.data?.userId !== userId) {
      throw new NotFoundException('Digest job not found');
    }

    const state = (await job.getState()) as DigestJobState;
    const result =
      state === 'completed' && job.returnvalue ? (job.returnvalue as unknown as Digest) : null;
    const error = state === 'failed' ? (job.failedReason ?? 'Digest generation failed') : null;

    return { jobId, state, result, error };
  }

  private async findActiveJob(userId: string, periodType: DigestPeriodType, periodStart: string) {
    const jobs = await this.digestQueue.getJobs(['active', 'waiting', 'delayed', 'paused']);
    return (
      jobs.find(
        (j) =>
          j.data?.userId === userId &&
          j.data?.periodType === periodType &&
          j.data?.periodStart === periodStart,
      ) ?? null
    );
  }

  /**
   * The actual generation pass, invoked by the DIGEST worker. Idempotent on
   * (user, period): re-checks for an existing row (covers the race where one
   * was created between enqueue and processing) before any LLM call.
   */
  async generate(userId: string, periodType: DigestPeriodType, date: string): Promise<Digest> {
    const { periodStart, periodEnd } = computePeriodBounds(periodType, date);

    // Idempotency check before any LLM call.
    const existing = await this.repo.findOne({
      where: { userId, periodType, periodStart },
    });
    if (existing) {
      this.logger.log(
        `digest reuse user=${userId} period=${periodType}/${periodStart} id=${existing.id}`,
      );
      return existing;
    }

    // Use a single Postgres-native window query — DATE + interval gives
    // us the inclusive [periodStart 00:00, periodEnd+1day 00:00) bucket
    // independent of any client-side TZ confusion. Sorting by importance
    // means the 50-cap takes the high-value articles first.
    const articleRows = (await this.dataSource.query(
      `SELECT id, title, summary, importance, published_at
       FROM articles
       WHERE user_id = $1
         AND status = 'processed'
         AND published_at IS NOT NULL
         AND published_at >= $2::date
         AND published_at < ($3::date + interval '1 day')
       ORDER BY
         CASE importance WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
         published_at DESC NULLS LAST
       LIMIT $4`,
      [userId, periodStart, periodEnd, DigestsService.MAX_ARTICLES_PER_DIGEST],
    )) as Array<{
      id: string;
      title: string | null;
      summary: string | null;
      importance: string | null;
      published_at: Date;
    }>;

    if (articleRows.length === 0) {
      // 400 (not 500) so the frontend can surface a friendly message —
      // an empty period is a user-input issue, not a server fault.
      throw new BadRequestException(
        `No processed articles found for the ${periodType} of ${periodStart}.`,
      );
    }

    const llmResult = await this.llm.buildDigest(
      {
        periodType,
        periodStart,
        periodEnd,
        articles: articleRows.map((r) => ({
          title: r.title,
          summary: r.summary,
          importance: r.importance,
        })),
      },
      userId,
    );

    // Top entities for the period — recomputed from the link table rather
    // than trusting the LLM's `topEntityNames`. The SQL count is truth;
    // the LLM list is a hint. We could surface both but the SQL version
    // matches the rest of the UI's "top entities by mentions" semantics,
    // so we use it consistently.
    const entityRows = (await this.dataSource.query(
      `SELECT e.canonical_name, count(*)::int AS mention_count
       FROM article_entities ae
       JOIN articles a ON a.id = ae.article_id
       JOIN entities e ON e.id = ae.entity_id
       WHERE a.user_id = $1
         AND a.status = 'processed'
         AND a.published_at IS NOT NULL
         AND a.published_at >= $2::date
         AND a.published_at < ($3::date + interval '1 day')
       GROUP BY e.canonical_name
       ORDER BY mention_count DESC, e.canonical_name ASC
       LIMIT 10`,
      [userId, periodStart, periodEnd],
    )) as Array<{ canonical_name: string; mention_count: number }>;
    const topEntities = entityRows.map((r) => r.canonical_name);

    // Persist via repo.save so the entity goes through TypeORM lifecycle
    // (validation, change tracking). The DB unique constraint backstops
    // a race between two concurrent generate() calls — second one would
    // raise, we catch and re-read.
    const draft = this.repo.create({
      userId,
      periodType,
      periodStart,
      periodEnd,
      summary: llmResult.executiveSummary,
      keyThemes: llmResult.keyThemes,
      topEntities,
      articleCount: articleRows.length,
      sentiment: llmResult.sentiment,
    });

    try {
      const saved = await this.repo.save(draft);
      this.logger.log(
        `digest created user=${userId} period=${periodType}/${periodStart} ` +
          `articles=${articleRows.length} themes=${llmResult.keyThemes.length} ` +
          `sentiment=${llmResult.sentiment} top_entities=${topEntities.length}`,
      );
      return saved;
    } catch (err) {
      // 23505 = unique_violation; another concurrent caller beat us to it.
      if ((err as { code?: string })?.code === '23505') {
        const winner = await this.repo.findOne({
          where: { userId, periodType, periodStart },
        });
        if (winner) {
          this.logger.warn(
            `digest race lost user=${userId} period=${periodType}/${periodStart} — returning concurrent winner id=${winner.id}`,
          );
          return winner;
        }
      }
      throw err;
    }
  }

  async list(userId: string): Promise<Digest[]> {
    return this.repo.find({
      where: { userId },
      order: { periodStart: 'DESC', createdAt: 'DESC' },
      take: DigestsService.LIST_LIMIT,
    });
  }

  async findOne(userId: string, id: string): Promise<Digest> {
    const digest = await this.repo.findOne({ where: { id, userId } });
    if (!digest) {
      // 404 on cross-tenant (and also genuinely-missing) — never 403, to
      // avoid acknowledging existence of other users' resources.
      throw new NotFoundException('Digest not found');
    }
    return digest;
  }
}

/**
 * Pure date math. All UTC — Postgres DATE is timezone-naive and we want
 * "week of May 25" to mean the same calendar week for everyone, not
 * shift by local timezone.
 *
 * Exported for unit testing if/when we add a test suite for date logic;
 * not part of the public service contract.
 */
export function computePeriodBounds(
  periodType: DigestPeriodType,
  date: string,
): { periodStart: string; periodEnd: string } {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid date '${date}' (expected YYYY-MM-DD).`);
  }

  if (periodType === 'day') {
    return { periodStart: toDate(d), periodEnd: toDate(d) };
  }

  if (periodType === 'week') {
    // ISO week: Monday is day 1, Sunday is day 7. JS getUTCDay returns
    // 0 for Sunday so we map (Sunday → 7 → back 6 to reach Monday).
    const day = d.getUTCDay();
    const shiftToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + shiftToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { periodStart: toDate(monday), periodEnd: toDate(sunday) };
  }

  // month
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  // Day 0 of the next month = last day of this month.
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { periodStart: toDate(monthStart), periodEnd: toDate(monthEnd) };
}

function toDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

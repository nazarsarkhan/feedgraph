import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Multi-tenant contract: the per-user methods (getSummary, getRecent) filter
 * by user_id and never reveal another user's activity. The llm_telemetry table
 * allows user_id IS NULL (system-level worker calls without a user context);
 * those rows are excluded from the per-user view. getAdminSummary is the single
 * documented exception — guarded by AdminGuard at the controller, it drops the
 * filter to aggregate every user plus the system NULL rows.
 *
 * All SQL is parameterized; the bound values (window bounds, user_id) are
 * passed positionally so they never land in the query string.
 */

export interface TelemetryProviderBreakdown {
  provider: string;
  calls: number;
  tokens: number;
  successRate: number;
}

export interface TelemetryOperationBreakdown {
  operation: string;
  calls: number;
  tokens: number;
}

export interface TelemetryTimelinePoint {
  date: string;
  tokens: number;
}

export interface TelemetrySummary {
  totalCalls: number;
  totalTokens: number;
  cacheHitRate: number;
  failoverRate: number;
  successRate: number;
  byProvider: TelemetryProviderBreakdown[];
  byOperation: TelemetryOperationBreakdown[];
  tokenTimeline: TelemetryTimelinePoint[];
}

export interface TelemetryRecentRow {
  id: string;
  provider: string;
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  cacheHit: boolean;
  success: boolean;
  failoverFrom: string | null;
  errorMessage: string | null;
  createdAt: string;
}

// Raw query results land as untyped rows from typeorm's .query(). We map
// each shape to the typed DTO shape; the `any` lives only at this boundary.
interface OverallRow {
  total_calls: number | string | null;
  total_tokens: number | string | null;
  cache_hit_rate: string | null;
  failover_rate: string | null;
  success_rate: string | null;
}

interface ProviderRow {
  provider: string;
  calls: number | string;
  tokens: number | string;
  success_rate: string | null;
}

interface OperationRow {
  operation: string;
  calls: number | string;
  tokens: number | string;
}

interface TimelineRow {
  date: string;
  tokens: number | string;
}

interface RecentRow {
  id: string;
  provider: string;
  model: string;
  operation: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  cache_hit: boolean;
  success: boolean;
  failover_from: string | null;
  error_message: string | null;
  created_at: Date | string;
}

@Injectable()
export class TelemetryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Per-user summary — the multi-tenant default; only the caller's own rows. */
  async getSummary(
    userId: string,
    opts?: { from?: string; to?: string },
  ): Promise<TelemetrySummary> {
    return this.computeSummary(userId, opts);
  }

  /**
   * Admin-only cross-user summary (guarded by AdminGuard at the controller).
   * Passing null drops the user_id filter, so the aggregate spans every user
   * AND the system rows where user_id IS NULL (worker calls with no user
   * context) — the rows the per-user view deliberately excludes.
   */
  async getAdminSummary(opts?: { from?: string; to?: string }): Promise<TelemetrySummary> {
    return this.computeSummary(null, opts);
  }

  private async computeSummary(
    userId: string | null,
    opts?: { from?: string; to?: string },
  ): Promise<TelemetrySummary> {
    // Resolve the window. Defaults to the last 14 days when unspecified, so the
    // whole summary (totals, rates, breakdowns, timeline) reflects one coherent
    // period rather than the old mix of all-time stats + a 14-day timeline.
    const to = opts?.to ? new Date(opts.to) : new Date();
    const from = opts?.from
      ? new Date(opts.from)
      : new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000);
    // $1/$2 are always the window bounds. user_id, when scoped, binds as $3 and
    // the clause is appended; admin scope (userId === null) omits it entirely.
    const userClause = userId === null ? '' : ' AND user_id = $3';
    const range =
      userId === null
        ? [from.toISOString(), to.toISOString()]
        : [from.toISOString(), to.toISOString(), userId];

    // 1. Overall rates. avg() of a 1/0 CASE is the rate; round to 4dp so
    //    the wire value is short. coalesce protects against an empty window.
    const overallRows = (await this.dataSource.query(
      `SELECT
         count(*)::int                                                                AS total_calls,
         coalesce(sum(prompt_tokens + completion_tokens), 0)::int                     AS total_tokens,
         round(avg(CASE WHEN cache_hit                       THEN 1.0 ELSE 0.0 END), 4) AS cache_hit_rate,
         round(avg(CASE WHEN failover_from IS NOT NULL       THEN 1.0 ELSE 0.0 END), 4) AS failover_rate,
         round(avg(CASE WHEN success                         THEN 1.0 ELSE 0.0 END), 4) AS success_rate
       FROM llm_telemetry
       WHERE created_at >= $1 AND created_at <= $2${userClause}`,
      range,
    )) as OverallRow[];

    const byProvider = (await this.dataSource.query(
      `SELECT
         provider,
         count(*)::int                                            AS calls,
         coalesce(sum(prompt_tokens + completion_tokens), 0)::int AS tokens,
         round(avg(CASE WHEN success THEN 1.0 ELSE 0.0 END), 4)   AS success_rate
       FROM llm_telemetry
       WHERE created_at >= $1 AND created_at <= $2${userClause}
       GROUP BY provider
       ORDER BY calls DESC`,
      range,
    )) as ProviderRow[];

    const byOperation = (await this.dataSource.query(
      `SELECT
         operation,
         count(*)::int                                            AS calls,
         coalesce(sum(prompt_tokens + completion_tokens), 0)::int AS tokens
       FROM llm_telemetry
       WHERE created_at >= $1 AND created_at <= $2${userClause}
       GROUP BY operation
       ORDER BY calls DESC`,
      range,
    )) as OperationRow[];

    // Daily token buckets across the window. The frontend gap-fills missing days.
    const timeline = (await this.dataSource.query(
      `SELECT
         to_char(date_trunc('day', created_at), 'YYYY-MM-DD')      AS date,
         coalesce(sum(prompt_tokens + completion_tokens), 0)::int  AS tokens
       FROM llm_telemetry
       WHERE created_at >= $1 AND created_at <= $2${userClause}
       GROUP BY date_trunc('day', created_at)
       ORDER BY date_trunc('day', created_at) ASC`,
      range,
    )) as TimelineRow[];

    const row = overallRows[0] ?? ({} as OverallRow);
    return {
      totalCalls: Number(row.total_calls ?? 0),
      totalTokens: Number(row.total_tokens ?? 0),
      cacheHitRate: parseFloat(row.cache_hit_rate ?? '0') || 0,
      failoverRate: parseFloat(row.failover_rate ?? '0') || 0,
      successRate: parseFloat(row.success_rate ?? '0') || 0,
      byProvider: byProvider.map((r) => ({
        provider: r.provider,
        calls: Number(r.calls),
        tokens: Number(r.tokens),
        successRate: parseFloat(r.success_rate ?? '0') || 0,
      })),
      byOperation: byOperation.map((r) => ({
        operation: r.operation,
        calls: Number(r.calls),
        tokens: Number(r.tokens),
      })),
      tokenTimeline: timeline.map((r) => ({
        date: r.date,
        tokens: Number(r.tokens),
      })),
    };
  }

  async getRecent(userId: string, limit = 20): Promise<TelemetryRecentRow[]> {
    const rows = (await this.dataSource.query(
      `SELECT id, provider, model, operation,
              prompt_tokens, completion_tokens, latency_ms,
              cache_hit, success, failover_from, error_message,
              created_at
       FROM llm_telemetry
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    )) as RecentRow[];

    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      model: r.model,
      operation: r.operation,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      latencyMs: r.latency_ms,
      cacheHit: r.cache_hit,
      success: r.success,
      failoverFrom: r.failover_from,
      errorMessage: r.error_message,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
  }
}

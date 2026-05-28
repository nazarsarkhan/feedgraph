import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';

/**
 * Multi-tenant contract: every query filters by user_id. Aggregations
 * are computed via raw SQL on the DataSource — no materialized view,
 * no cache — because GROUP BY on indexed columns is sub-millisecond at
 * MVP scale (see PLAN.md ADR). The endpoint is read-only and cheap
 * enough to be re-fetched on every period change.
 *
 * Period is `[from, to + 1 day)` — both bounds are calendar dates,
 * `to` is inclusive (we add a day to convert to the half-open
 * timestamp range Postgres needs).
 */

const DEFAULT_DAYS = 7;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('dashboard')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class DashboardController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('summary')
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{
    period: { from: string; to: string };
    stats: { totalArticles: number; highImportance: number; filtered: number };
    topEntities: Array<{
      id: string;
      canonicalName: string;
      type: string;
      mentionCount: number;
    }>;
    topCategories: Array<{ name: string; articleCount: number }>;
    topFeed: { name: string; articleCount: number } | null;
  }> {
    const todayIso = new Date().toISOString().slice(0, 10);
    const fromDate = from ?? toDateString(Date.now() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
    const toDate = to ?? todayIso;

    if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) {
      // 400 (not 500) so the frontend gets a typed error and the user
      // sees a friendly message; YYYY-MM-DD is the only shape we accept.
      throw new BadRequestException('from and to must be YYYY-MM-DD calendar dates.');
    }

    const userId = user.id;

    const topEntities = (await this.dataSource.query(
      `SELECT
         e.id,
         e.canonical_name AS "canonicalName",
         e.type,
         count(DISTINCT ae.article_id)::int AS "mentionCount"
       FROM entities e
       JOIN article_entities ae ON ae.entity_id = e.id
       JOIN articles a ON a.id = ae.article_id
       WHERE e.user_id = $1
         AND a.status = 'processed'
         AND a.published_at IS NOT NULL
         AND a.published_at >= $2::date
         AND a.published_at < ($3::date + interval '1 day')
       GROUP BY e.id, e.canonical_name, e.type
       ORDER BY "mentionCount" DESC, e.canonical_name ASC
       LIMIT 10`,
      [userId, fromDate, toDate],
    )) as Array<{ id: string; canonicalName: string; type: string; mentionCount: number }>;

    const topCategories = (await this.dataSource.query(
      `SELECT
         c.name,
         count(DISTINCT ac.article_id)::int AS "articleCount"
       FROM categories c
       JOIN article_categories ac ON ac.category_id = c.id
       JOIN articles a ON a.id = ac.article_id
       WHERE c.user_id = $1
         AND a.status = 'processed'
         AND a.published_at IS NOT NULL
         AND a.published_at >= $2::date
         AND a.published_at < ($3::date + interval '1 day')
       GROUP BY c.name
       ORDER BY "articleCount" DESC, c.name ASC
       LIMIT 5`,
      [userId, fromDate, toDate],
    )) as Array<{ name: string; articleCount: number }>;

    const statsRows = (await this.dataSource.query(
      // Three counters in a single scan via FILTER (WHERE …) — cheaper
      // than three round trips. totalArticles counts every row in the
      // period (filtered + processed + pending + error) because the
      // "Total articles" stat on the dashboard means "everything we
      // saw"; highImportance and filtered are narrower slices.
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE importance = 'high')::int AS "highImportance",
         count(*) FILTER (WHERE status = 'filtered')::int AS filtered
       FROM articles
       WHERE user_id = $1
         AND published_at IS NOT NULL
         AND published_at >= $2::date
         AND published_at < ($3::date + interval '1 day')`,
      [userId, fromDate, toDate],
    )) as Array<{ total: number; highImportance: number; filtered: number }>;

    const topFeedRows = (await this.dataSource.query(
      `SELECT
         f.name,
         count(*)::int AS "articleCount"
       FROM articles a
       JOIN feeds f ON f.id = a.feed_id
       WHERE a.user_id = $1
         AND a.status = 'processed'
         AND a.published_at IS NOT NULL
         AND a.published_at >= $2::date
         AND a.published_at < ($3::date + interval '1 day')
       GROUP BY f.name
       ORDER BY "articleCount" DESC, f.name ASC
       LIMIT 1`,
      [userId, fromDate, toDate],
    )) as Array<{ name: string; articleCount: number }>;

    const stats = statsRows[0] ?? { total: 0, highImportance: 0, filtered: 0 };

    return {
      period: { from: fromDate, to: toDate },
      stats: {
        totalArticles: stats.total,
        highImportance: stats.highImportance,
        filtered: stats.filtered,
      },
      topEntities,
      topCategories,
      topFeed: topFeedRows[0] ?? null,
    };
  }
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

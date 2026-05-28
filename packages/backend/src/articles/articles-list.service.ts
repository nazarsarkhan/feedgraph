import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { QUEUE_NAMES } from '../queue/queue-names';
import { Article, ArticleImportance, ArticleStatus } from './article.entity';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto';

/**
 * Multi-tenant contract: every public method here takes userId as the
 * first param and every query MUST filter by user_id. Cross-tenant access
 * returns 404 (never 403). This is the read-only counterpart to
 * ArticlesService (which owns RSS upserts); workers own status changes.
 */

export interface ArticleListItem {
  id: string;
  title: string | null;
  summary: string | null;
  url: string;
  feedId: string | null;
  feedName: string | null;
  publishedAt: string | null;
  createdAt: string;
  status: ArticleStatus;
  filterReason: string | null;
  importance: ArticleImportance | null;
  entities: { id: string; name: string; type: string }[];
  categories: string[];
  similarCount: number;
}

export interface ArticleDetail extends ArticleListItem {
  contentRaw: string | null;
  summaryRaw: string | null;
  author: string | null;
  guid: string | null;
  axisAssignments: { axis: string; value: string }[];
  similarArticles: { id: string; title: string | null; feedName: string | null }[];
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ArticleRow {
  id: string;
  title: string | null;
  summary: string | null;
  url: string;
  feed_id: string | null;
  published_at: Date | null;
  created_at: Date;
  status: ArticleStatus;
  filter_reason: string | null;
  importance: ArticleImportance | null;
  content_hash: string;
}

interface ArticleDetailRow extends ArticleRow {
  content_raw: string | null;
  summary_raw: string | null;
  author: string | null;
  guid: string | null;
}

const DEFAULTS = {
  page: 1,
  pageSize: 20,
  sortBy: 'publishedAt' as const,
  order: 'desc' as const,
};

@Injectable()
export class ArticlesListService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(QUEUE_NAMES.ARTICLE_PROCESS) private readonly articleProcessQueue: Queue,
  ) {}

  async list(
    userId: string,
    filters: ListArticlesQueryDto,
  ): Promise<{ items: ArticleListItem[]; pagination: PaginationMeta }> {
    const page = filters.page ?? DEFAULTS.page;
    const pageSize = filters.pageSize ?? DEFAULTS.pageSize;
    const sortBy = filters.sortBy ?? DEFAULTS.sortBy;
    const order = filters.order ?? DEFAULTS.order;

    // Stage 1: paginated article query.
    // Builder is built twice (once for COUNT, once for paged SELECT) so that
    // ORDER BY / LIMIT / OFFSET don't end up in the COUNT plan.
    const baseQb = (): ReturnType<DataSource['createQueryBuilder']> => {
      const qb = this.dataSource
        .createQueryBuilder(Article, 'a')
        .where('a.user_id = :userId', { userId });

      if (filters.category) {
        // INNER JOIN narrows the result set — articles without the category
        // are excluded entirely. Distinct not needed: PK on article_categories
        // is (article_id, category_id) so at most one row joins per article.
        qb.innerJoin(
          'article_categories',
          'ac',
          'ac.article_id = a.id AND ac.category_id = :categoryId',
          { categoryId: filters.category },
        );
      }
      if (filters.feedId) {
        qb.andWhere('a.feed_id = :feedId', { feedId: filters.feedId });
      }
      if (filters.importance) {
        qb.andWhere('a.importance = :importance', { importance: filters.importance });
      }
      if (filters.status) {
        qb.andWhere('a.status = :status', { status: filters.status });
      }
      if (filters.from) {
        qb.andWhere('a.published_at >= :from', { from: filters.from });
      }
      if (filters.to) {
        qb.andWhere('a.published_at <= :to', { to: filters.to });
      }
      const qTrimmed = filters.q?.trim();
      if (qTrimmed && qTrimmed.length > 0) {
        // websearch_to_tsquery is the user-facing tsquery variant —
        // it accepts the conventions web users already know: bare
        // words are AND'd, "quoted phrases" are phrase searches,
        // "OR" between terms is alternation, and a leading "-" is
        // negation. It never raises on malformed input (unlike
        // to_tsquery), which means a typo'd query degrades to "no
        // matches" instead of a 500. Postgres 11+.
        qb.andWhere(`a.search_vector @@ websearch_to_tsquery('english', :q)`, { q: qTrimmed });
      }
      return qb;
    };

    const total = await baseQb().getCount();

    const sortColumn = sortBy === 'publishedAt' ? 'a.published_at' : 'a.created_at';
    const orderDir = order === 'asc' ? 'ASC' : 'DESC';
    // NULLS LAST keeps publishedAt-null articles (sometimes RSS omits the
    // date) from dominating the first page on DESC sorts.
    const nullsClause = order === 'asc' ? 'NULLS FIRST' : 'NULLS LAST';

    const rows = (await baseQb()
      .select([
        'a.id AS id',
        'a.title AS title',
        'a.summary AS summary',
        'a.url AS url',
        'a.feed_id AS feed_id',
        'a.published_at AS published_at',
        'a.created_at AS created_at',
        'a.status AS status',
        'a.filter_reason AS filter_reason',
        'a.importance AS importance',
        'a.content_hash AS content_hash',
      ])
      .orderBy(
        sortColumn,
        orderDir,
        sortBy === 'publishedAt' ? (nullsClause as 'NULLS LAST' | 'NULLS FIRST') : undefined,
      )
      // Tie-break by id for stable pagination when two rows share the sort
      // column value (common on createdAt at second resolution).
      .addOrderBy('a.id', orderDir)
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .getRawMany()) as ArticleRow[];

    if (rows.length === 0) {
      return {
        items: [],
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    }

    const ids = rows.map((r) => r.id);
    const feedIds = Array.from(
      new Set(rows.map((r) => r.feed_id).filter((v): v is string => v !== null)),
    );

    // Stage 2: batch enrichment. All four queries are independent of each
    // other; run them in parallel. Each does ONE round-trip regardless of
    // page size — N+0, not N+1.
    const [feedNameMap, entitiesByArticle, categoriesByArticle, similarCountMap] =
      await Promise.all([
        this.loadFeedNames(feedIds),
        this.loadEntitiesForArticles(ids),
        this.loadCategoriesForArticles(ids),
        this.loadSimilarCounts(userId, rows),
      ]);

    const items: ArticleListItem[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      url: r.url,
      feedId: r.feed_id,
      feedName: r.feed_id ? (feedNameMap.get(r.feed_id) ?? null) : null,
      publishedAt: r.published_at ? r.published_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
      status: r.status,
      filterReason: r.filter_reason,
      importance: r.importance,
      entities: entitiesByArticle.get(r.id) ?? [],
      categories: categoriesByArticle.get(r.id) ?? [],
      similarCount: similarCountMap.get(r.id) ?? 0,
    }));

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  /**
   * Reset processed articles to pending_llm AND enqueue article-process
   * jobs so the worker actually picks them up. Also re-enqueues any
   * `pending_llm` articles that were stuck (e.g. exhausted BullMQ
   * retries) so the action doubles as a "un-stuck me" recovery.
   *
   * Single UPDATE with RETURNING `id` to get the affected article ids
   * without a second SELECT round-trip; then one Redis round-trip via
   * `addBulk` regardless of count. `reset` counts rows that actually
   * transitioned (processed → pending_llm); `enqueued` counts every
   * row whose status is now pending_llm and that we handed to the
   * worker (always >= reset).
   *
   * This is the ONLY mutation in the articles HTTP layer — every other
   * status transition is owned by a BullMQ worker. Wired here because
   * the action belongs to a user-driven settings flow, not a pipeline
   * event. The worker is idempotent on article.status (returns no-op
   * for any status other than pending_llm), so a duplicate enqueue is
   * safe.
   */
  async regenerate(userId: string): Promise<{ reset: number; enqueued: number }> {
    // Step 1. Flip processed → pending_llm and capture which ids
    // transitioned (RETURNING gives us the IDs in one round trip;
    // no separate SELECT needed). `reset` is exactly this count.
    const result = await this.dataSource
      .createQueryBuilder()
      .update(Article)
      .set({ status: 'pending_llm' satisfies ArticleStatus })
      .where('user_id = :userId AND status = :status', {
        userId,
        status: 'processed' satisfies ArticleStatus,
      })
      .returning('id')
      .execute();
    const resetIds = (result.raw as { id: string }[]).map((r) => r.id);

    // Step 2. Find pending_llm rows we did NOT just transition — those
    // were already pending_llm before this call (stuck after worker
    // retries, or any other reason the worker never picked them up).
    // Enqueuing them too means regenerate doubles as "un-stuck me".
    let stuckQb = this.dataSource
      .createQueryBuilder(Article, 'a')
      .select('a.id', 'id')
      .where('a.user_id = :userId AND a.status = :status', {
        userId,
        status: 'pending_llm' satisfies ArticleStatus,
      });
    if (resetIds.length > 0) {
      stuckQb = stuckQb.andWhere('a.id NOT IN (:...resetIds)', { resetIds });
    }
    const stuckIds = ((await stuckQb.getRawMany()) as { id: string }[]).map((r) => r.id);

    const allIds = [...resetIds, ...stuckIds];
    if (allIds.length === 0) {
      return { reset: 0, enqueued: 0 };
    }

    // Step 3. One Redis round-trip via addBulk regardless of count.
    // Retry profile matches PrefilterService's hand-off (3 attempts,
    // exponential backoff with a 60s base) so LLM rate limits get a
    // reasonable cool-off window. The article-process worker is
    // idempotent on article.status (returns no-op for any status
    // other than pending_llm), so a duplicate enqueue is safe.
    await this.articleProcessQueue.addBulk(
      allIds.map((articleId) => ({
        name: 'process',
        data: { articleId },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
      })),
    );

    return { reset: resetIds.length, enqueued: allIds.length };
  }

  async detail(userId: string, articleId: string): Promise<ArticleDetail> {
    const row = (await this.dataSource
      .createQueryBuilder(Article, 'a')
      .where('a.id = :articleId AND a.user_id = :userId', { articleId, userId })
      .select([
        'a.id AS id',
        'a.title AS title',
        'a.summary AS summary',
        'a.summary_raw AS summary_raw',
        'a.content_raw AS content_raw',
        'a.url AS url',
        'a.feed_id AS feed_id',
        'a.published_at AS published_at',
        'a.created_at AS created_at',
        'a.status AS status',
        'a.filter_reason AS filter_reason',
        'a.importance AS importance',
        'a.content_hash AS content_hash',
        'a.author AS author',
        'a.guid AS guid',
      ])
      .getRawOne()) as ArticleDetailRow | undefined;

    if (!row) {
      // 404 on cross-tenant access — same code path as "doesn't exist".
      throw new NotFoundException('Article not found');
    }

    const feedIds = row.feed_id ? [row.feed_id] : [];

    const [feedNameMap, entitiesByArticle, categoriesByArticle, axisAssignments, similar] =
      await Promise.all([
        this.loadFeedNames(feedIds),
        this.loadEntitiesForArticles([row.id]),
        this.loadCategoriesForArticles([row.id]),
        this.loadAxisAssignments(row.id),
        this.loadSimilarArticles(userId, row.id, row.content_hash),
      ]);

    const similarFeedIds = Array.from(
      new Set(similar.map((s) => s.feedId).filter((v): v is string => v !== null)),
    );
    const similarFeedNames = similarFeedIds.length
      ? await this.loadFeedNames(similarFeedIds)
      : new Map<string, string>();

    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      url: row.url,
      feedId: row.feed_id,
      feedName: row.feed_id ? (feedNameMap.get(row.feed_id) ?? null) : null,
      publishedAt: row.published_at ? row.published_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      status: row.status,
      filterReason: row.filter_reason,
      importance: row.importance,
      entities: entitiesByArticle.get(row.id) ?? [],
      categories: categoriesByArticle.get(row.id) ?? [],
      similarCount: similar.length,
      contentRaw: row.content_raw,
      summaryRaw: row.summary_raw,
      author: row.author,
      guid: row.guid,
      axisAssignments,
      similarArticles: similar.map((s) => ({
        id: s.id,
        title: s.title,
        feedName: s.feedId ? (similarFeedNames.get(s.feedId) ?? null) : null,
      })),
    };
  }

  private async loadFeedNames(feedIds: string[]): Promise<Map<string, string>> {
    if (feedIds.length === 0) return new Map();
    const rows = (await this.dataSource
      .createQueryBuilder()
      .select(['f.id AS id', 'f.name AS name'])
      .from('feeds', 'f')
      .where('f.id = ANY(:feedIds)', { feedIds })
      .getRawMany()) as { id: string; name: string | null }[];
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.name !== null) map.set(r.id, r.name);
    }
    return map;
  }

  private async loadEntitiesForArticles(
    articleIds: string[],
  ): Promise<Map<string, { id: string; name: string; type: string }[]>> {
    const map = new Map<string, { id: string; name: string; type: string }[]>();
    if (articleIds.length === 0) return map;
    const rows = (await this.dataSource
      .createQueryBuilder()
      .select([
        'ae.article_id AS article_id',
        'e.id AS entity_id',
        'e.canonical_name AS name',
        'e.type AS type',
      ])
      .from('article_entities', 'ae')
      .innerJoin('entities', 'e', 'e.id = ae.entity_id')
      .where('ae.article_id = ANY(:ids)', { ids: articleIds })
      .orderBy('e.canonical_name', 'ASC')
      .getRawMany()) as { article_id: string; entity_id: string; name: string; type: string }[];
    for (const r of rows) {
      const list = map.get(r.article_id) ?? [];
      list.push({ id: r.entity_id, name: r.name, type: r.type });
      map.set(r.article_id, list);
    }
    return map;
  }

  private async loadCategoriesForArticles(articleIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (articleIds.length === 0) return map;
    const rows = (await this.dataSource
      .createQueryBuilder()
      .select(['ac.article_id AS article_id', 'c.name AS name'])
      .from('article_categories', 'ac')
      .innerJoin('categories', 'c', 'c.id = ac.category_id')
      .where('ac.article_id = ANY(:ids)', { ids: articleIds })
      .orderBy('c.name', 'ASC')
      .getRawMany()) as { article_id: string; name: string }[];
    for (const r of rows) {
      const list = map.get(r.article_id) ?? [];
      list.push(r.name);
      map.set(r.article_id, list);
    }
    return map;
  }

  private async loadAxisAssignments(articleId: string): Promise<{ axis: string; value: string }[]> {
    const rows = (await this.dataSource
      .createQueryBuilder()
      .select(['ax.name AS axis', 'v.value AS value'])
      .from('article_axis_values', 'aav')
      .innerJoin('axis_values', 'v', 'v.id = aav.axis_value_id')
      .innerJoin('axes', 'ax', 'ax.id = v.axis_id')
      .where('aav.article_id = :articleId', { articleId })
      .orderBy('ax.name', 'ASC')
      .addOrderBy('v.value', 'ASC')
      .getRawMany()) as { axis: string; value: string }[];
    return rows;
  }

  private async loadSimilarArticles(
    userId: string,
    articleId: string,
    contentHash: string,
  ): Promise<{ id: string; title: string | null; feedId: string | null }[]> {
    const rows = (await this.dataSource
      .createQueryBuilder()
      .select(['a.id AS id', 'a.title AS title', 'a.feed_id AS feed_id'])
      .from('articles', 'a')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.content_hash = :contentHash', { contentHash })
      .andWhere('a.id != :articleId', { articleId })
      .orderBy('a.published_at', 'DESC', 'NULLS LAST')
      .limit(10)
      .getRawMany()) as { id: string; title: string | null; feed_id: string | null }[];
    return rows.map((r) => ({ id: r.id, title: r.title, feedId: r.feed_id }));
  }

  /**
   * Batch similar_count via GROUP BY: one query per page regardless of size.
   * For each content_hash on the page, count articles the user owns that
   * share it but live on a different feed_id (cross-source duplicates).
   * Articles with no feed_id (or hash bucket of size 1) contribute zero.
   */
  private async loadSimilarCounts(
    userId: string,
    rows: ArticleRow[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (rows.length === 0) return map;

    const hashes = Array.from(new Set(rows.map((r) => r.content_hash)));
    const counts = (await this.dataSource
      .createQueryBuilder()
      .select(['a.content_hash AS content_hash', 'a.feed_id AS feed_id', 'COUNT(*) AS count'])
      .from('articles', 'a')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.content_hash = ANY(:hashes)', { hashes })
      .groupBy('a.content_hash')
      .addGroupBy('a.feed_id')
      .getRawMany()) as { content_hash: string; feed_id: string | null; count: string }[];

    // Group by content_hash: total cluster size minus rows from this article's own feed.
    const clusterTotals = new Map<string, number>();
    const sameFeedCounts = new Map<string, Map<string | null, number>>();
    for (const c of counts) {
      const n = Number(c.count);
      clusterTotals.set(c.content_hash, (clusterTotals.get(c.content_hash) ?? 0) + n);
      const inner = sameFeedCounts.get(c.content_hash) ?? new Map<string | null, number>();
      inner.set(c.feed_id, n);
      sameFeedCounts.set(c.content_hash, inner);
    }

    for (const r of rows) {
      const total = clusterTotals.get(r.content_hash) ?? 0;
      const sameFeed = sameFeedCounts.get(r.content_hash)?.get(r.feed_id) ?? 0;
      // "similar" = cross-source duplicates: cluster size minus the bucket
      // for this article's own feed (which includes the article itself).
      const similar = Math.max(0, total - sameFeed);
      map.set(r.id, similar);
    }
    return map;
  }
}

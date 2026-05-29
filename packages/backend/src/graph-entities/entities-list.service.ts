import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ListEntitiesQueryDto } from './dto/list-entities-query.dto';
import { GraphEntity, GraphEntityType } from './graph-entity.entity';

/**
 * Multi-tenant contract: every public method here takes userId as the
 * first param and every query MUST filter by user_id. Cross-tenant access
 * returns 404 (never 403). Read-only counterpart to GraphEntitiesService
 * (which owns find-or-create from the article-process worker).
 */

export interface EntityListItem {
  id: string;
  canonicalName: string;
  type: GraphEntityType;
  aliases: string[];
  description: string | null;
  firstSeen: string;
  lastSeen: string;
  mentionCount: number;
}

export interface EntityDetail extends EntityListItem {
  mentioningArticles: {
    id: string;
    title: string | null;
    feedName: string | null;
    publishedAt: string | null;
  }[];
  relatedEntities: {
    id: string;
    canonicalName: string;
    type: GraphEntityType;
    coMentionCount: number;
  }[];
  mentionTimeline: {
    date: string;
    count: number;
  }[];
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface EntityRow {
  id: string;
  canonical_name: string;
  type: GraphEntityType;
  aliases: string[];
  description: string | null;
  first_seen: Date;
  last_seen: Date;
}

const DEFAULTS = {
  page: 1,
  pageSize: 20,
  sortBy: 'lastSeen' as const,
  order: 'desc' as const,
};

const MENTIONING_ARTICLES_CAP = 20;
const RELATED_ENTITIES_CAP = 20;

@Injectable()
export class EntitiesListService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(
    userId: string,
    filters: ListEntitiesQueryDto,
  ): Promise<{ items: EntityListItem[]; pagination: PaginationMeta }> {
    const page = filters.page ?? DEFAULTS.page;
    const pageSize = filters.pageSize ?? DEFAULTS.pageSize;
    const sortBy = filters.sortBy ?? DEFAULTS.sortBy;
    const order = filters.order ?? DEFAULTS.order;

    // Stage 1: paginated entity query.
    // Builder is built twice so COUNT doesn't carry ORDER BY / LIMIT.
    const baseQb = (): ReturnType<DataSource['createQueryBuilder']> => {
      const qb = this.dataSource
        .createQueryBuilder(GraphEntity, 'e')
        .where('e.user_id = :userId', { userId });

      if (filters.type) {
        qb.andWhere('e.type = :type', { type: filters.type });
      }
      if (filters.q) {
        // lower(canonical_name) LIKE lower(:q) is index-backed by the pg_trgm
        // GIN index entities_canonical_name_trgm_idx (migration 1717900000000).
        // Equivalent to a case-insensitive substring match, but the planner can
        // use the trigram index instead of a sequential scan as the table grows.
        qb.andWhere('lower(e.canonical_name) LIKE lower(:q)', { q: `%${filters.q}%` });
      }
      if (filters.minMentions !== undefined) {
        // Correlated subquery: simple to read, planner can rewrite, and at
        // MVP scale (<10k entities/user) it's well under a millisecond.
        // If perf degrades at scale, switch to pre-aggregating IDs:
        //   WITH counts AS (SELECT entity_id, count(*) c FROM article_entities
        //                   GROUP BY entity_id HAVING count(*) >= :n)
        //   ... WHERE e.id IN (SELECT entity_id FROM counts)
        qb.andWhere(
          '(SELECT count(*) FROM article_entities ae WHERE ae.entity_id = e.id) >= :minMentions',
          { minMentions: filters.minMentions },
        );
      }
      return qb;
    };

    const total = await baseQb().getCount();

    const orderDir = order === 'asc' ? 'ASC' : 'DESC';
    const qb = baseQb().select([
      'e.id AS id',
      'e.canonical_name AS canonical_name',
      'e.type AS type',
      'e.aliases AS aliases',
      'e.description AS description',
      'e.first_seen AS first_seen',
      'e.last_seen AS last_seen',
    ]);

    if (sortBy === 'mentionCount') {
      // Reuse the same correlated subquery as a sort key. Aliased so the
      // SELECT list and ORDER BY agree without forcing a second computation.
      qb.addSelect(
        '(SELECT count(*) FROM article_entities ae WHERE ae.entity_id = e.id)',
        'mention_count_sort',
      ).orderBy('mention_count_sort', orderDir);
    } else if (sortBy === 'name') {
      qb.orderBy('lower(e.canonical_name)', orderDir);
    } else {
      qb.orderBy('e.last_seen', orderDir);
    }
    // Stable tie-break for pagination.
    qb.addOrderBy('e.id', orderDir)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const rows = (await qb.getRawMany()) as EntityRow[];

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
    const mentionCountMap = await this.loadMentionCounts(ids);

    const items: EntityListItem[] = rows.map((r) => ({
      id: r.id,
      canonicalName: r.canonical_name,
      type: r.type,
      aliases: r.aliases ?? [],
      description: r.description,
      firstSeen: r.first_seen.toISOString(),
      lastSeen: r.last_seen.toISOString(),
      mentionCount: mentionCountMap.get(r.id) ?? 0,
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

  async detail(userId: string, entityId: string): Promise<EntityDetail> {
    const row = (await this.dataSource
      .createQueryBuilder(GraphEntity, 'e')
      .where('e.id = :entityId AND e.user_id = :userId', { entityId, userId })
      .select([
        'e.id AS id',
        'e.canonical_name AS canonical_name',
        'e.type AS type',
        'e.aliases AS aliases',
        'e.description AS description',
        'e.first_seen AS first_seen',
        'e.last_seen AS last_seen',
      ])
      .getRawOne()) as EntityRow | undefined;

    if (!row) {
      // 404 on cross-tenant access — same code path as "doesn't exist".
      throw new NotFoundException('Entity not found');
    }

    const [mentionCountMap, mentioning, related, timeline] = await Promise.all([
      this.loadMentionCounts([row.id]),
      this.loadMentioningArticles(row.id),
      this.loadRelatedEntities(userId, row.id),
      this.loadMentionTimeline(row.id),
    ]);

    const feedIds = Array.from(
      new Set(mentioning.map((m) => m.feedId).filter((v): v is string => v !== null)),
    );
    const feedNameMap = feedIds.length
      ? await this.loadFeedNames(feedIds)
      : new Map<string, string>();

    return {
      id: row.id,
      canonicalName: row.canonical_name,
      type: row.type,
      aliases: row.aliases ?? [],
      description: row.description,
      firstSeen: row.first_seen.toISOString(),
      lastSeen: row.last_seen.toISOString(),
      mentionCount: mentionCountMap.get(row.id) ?? 0,
      mentioningArticles: mentioning.map((m) => ({
        id: m.id,
        title: m.title,
        feedName: m.feedId ? (feedNameMap.get(m.feedId) ?? null) : null,
        publishedAt: m.publishedAt ? m.publishedAt.toISOString() : null,
      })),
      relatedEntities: related,
      mentionTimeline: timeline,
    };
  }

  private async loadMentionCounts(entityIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (entityIds.length === 0) return map;
    const rows = (await this.dataSource
      .createQueryBuilder()
      .select(['ae.entity_id AS entity_id', 'count(*) AS count'])
      .from('article_entities', 'ae')
      .where('ae.entity_id = ANY(:ids)', { ids: entityIds })
      .groupBy('ae.entity_id')
      .getRawMany()) as { entity_id: string; count: string }[];
    for (const r of rows) {
      map.set(r.entity_id, Number(r.count));
    }
    return map;
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

  private async loadMentioningArticles(
    entityId: string,
  ): Promise<
    { id: string; title: string | null; feedId: string | null; publishedAt: Date | null }[]
  > {
    const rows = (await this.dataSource
      .createQueryBuilder()
      .select([
        'a.id AS id',
        'a.title AS title',
        'a.feed_id AS feed_id',
        'a.published_at AS published_at',
      ])
      .from('article_entities', 'ae')
      .innerJoin('articles', 'a', 'a.id = ae.article_id')
      .where('ae.entity_id = :entityId', { entityId })
      .orderBy('a.published_at', 'DESC', 'NULLS LAST')
      .addOrderBy('a.id', 'DESC')
      .limit(MENTIONING_ARTICLES_CAP)
      .getRawMany()) as {
      id: string;
      title: string | null;
      feed_id: string | null;
      published_at: Date | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      feedId: r.feed_id,
      publishedAt: r.published_at,
    }));
  }

  private async loadRelatedEntities(
    userId: string,
    entityId: string,
  ): Promise<
    { id: string; canonicalName: string; type: GraphEntityType; coMentionCount: number }[]
  > {
    const rows = (await this.dataSource
      .createQueryBuilder()
      .select([
        'e2.id AS id',
        'e2.canonical_name AS canonical_name',
        'e2.type AS type',
        'count(*) AS co_mention_count',
      ])
      .from('article_entities', 'ae1')
      .innerJoin(
        'article_entities',
        'ae2',
        'ae2.article_id = ae1.article_id AND ae2.entity_id != ae1.entity_id',
      )
      .innerJoin('entities', 'e2', 'e2.id = ae2.entity_id')
      .where('ae1.entity_id = :entityId', { entityId })
      // Defensive: entities are dedup'd per (user_id, lower(name), type), so
      // a foreign user's entity should never share an article with this user's
      // entity. This filter is cheap insurance in case dedup ever regresses or
      // a future cross-user feature changes the invariant.
      .andWhere('e2.user_id = :userId', { userId })
      .groupBy('e2.id')
      .addGroupBy('e2.canonical_name')
      .addGroupBy('e2.type')
      .orderBy('co_mention_count', 'DESC')
      .addOrderBy('e2.canonical_name', 'ASC')
      .limit(RELATED_ENTITIES_CAP)
      .getRawMany()) as {
      id: string;
      canonical_name: string;
      type: GraphEntityType;
      co_mention_count: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      canonicalName: r.canonical_name,
      type: r.type,
      coMentionCount: Number(r.co_mention_count),
    }));
  }

  private async loadMentionTimeline(entityId: string): Promise<{ date: string; count: number }[]> {
    // COALESCE(published_at, created_at): some Atom feeds omit pubDate; we'd
    // rather count those articles on their ingest day than drop them from
    // the timeline silently.
    const rows = (await this.dataSource
      .createQueryBuilder()
      .select([
        "to_char(date_trunc('day', COALESCE(a.published_at, a.created_at)), 'YYYY-MM-DD') AS date",
        'count(*) AS count',
      ])
      .from('article_entities', 'ae')
      .innerJoin('articles', 'a', 'a.id = ae.article_id')
      .where('ae.entity_id = :entityId', { entityId })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany()) as { date: string; count: string }[];
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }
}

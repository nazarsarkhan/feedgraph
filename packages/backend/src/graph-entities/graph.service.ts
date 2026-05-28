import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Multi-tenant contract: getGraph takes userId as the first param and
 * every JOIN/WHERE filters by user_id. The graph endpoint returns the
 * full filtered graph for this user in one round trip — no pagination,
 * because the visual UI needs everything at once and entity counts are
 * small (~10k upper bound per user at MVP scale).
 *
 * Filters are applied in the backend rather than client-side: filtering
 * nodes in the browser would leave edges pointing at invisible
 * endpoints (dangling edges). Here, edges are computed against the
 * already-filtered node-id set, so the result is always edge-consistent.
 *
 * Articles (kind='article') are opt-in via `includeArticles` — see
 * ADR. The default response is entity-only (the current behaviour);
 * with `includeArticles=true` we add up to 30 article nodes plus
 * `mentions` edges from those articles to filtered entities.
 */

export interface GraphFilters {
  type?: string;
  minMentions?: number;
  includeArticles?: boolean;
}

export interface EntityGraphNode {
  id: string;
  kind: 'entity';
  canonicalName: string;
  type: string;
  aliases: string[];
  firstSeen: string;
  lastSeen: string;
  mentionCount: number;
  // The category name most often assigned to articles that mention
  // this entity. null when the entity has no categorised articles
  // (e.g. fresh entities the user hasn't tagged yet). Used by the
  // Graph page's "Color by: category" toggle for visual clustering;
  // backend-derived so all clients see the same canonical pick.
  topCategory: string | null;
}

export interface ArticleGraphNode {
  id: string;
  kind: 'article';
  title: string | null;
  importance: 'high' | 'normal' | null;
  publishedAt: string | null;
  url: string;
}

export type GraphNode = EntityGraphNode | ArticleGraphNode;

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  kind: 'co_mention' | 'mentions';
}

interface EntityRow {
  id: string;
  canonicalName: string;
  type: string;
  aliases: string[] | null;
  firstSeen: Date | string;
  lastSeen: Date | string;
  mentionCount: string | number | null;
  topCategory: string | null;
}

interface EdgeRow {
  source: string;
  target: string;
  weight: string | number;
}

interface ArticleRow {
  id: string;
  title: string | null;
  importance: 'high' | 'normal' | null;
  publishedAt: Date | string | null;
  url: string;
}

interface MentionRow {
  source: string;
  target: string;
}

// Cap on article nodes per response. Keeps the visual layout uncluttered
// — see ADR. Importance-then-recency sorted so the top is "most
// significant most recent" rather than just "latest".
const ARTICLE_NODE_CAP = 30;

@Injectable()
export class GraphService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getGraph(
    userId: string,
    filters?: GraphFilters,
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    // Entity nodes: every entity for this user, optionally narrowed by
    // type and mentionCount threshold. Each filter appends a
    // parameterized clause — no string interpolation of filter values.
    const params: unknown[] = [userId];
    let paramIdx = 2;
    let nodeQuery = `
      SELECT
        e.id,
        e.canonical_name AS "canonicalName",
        e.type,
        e.aliases,
        e.first_seen AS "firstSeen",
        e.last_seen AS "lastSeen",
        (SELECT count(*) FROM article_entities ae WHERE ae.entity_id = e.id)::int
          AS "mentionCount",
        -- The category most-assigned to articles that mention this entity.
        -- Per-entity correlated subquery: at MVP scale (<10k entities,
        -- <100k article_entities) this is sub-millisecond — promote to a
        -- single GROUP BY + LATERAL JOIN if it ever shows up in pg_stat.
        -- Tie-break by category name so ordering is deterministic.
        (
          SELECT c.name
          FROM article_categories ac
          JOIN categories c ON c.id = ac.category_id
          JOIN article_entities ae2 ON ae2.article_id = ac.article_id
          WHERE ae2.entity_id = e.id
            AND c.user_id = e.user_id
          GROUP BY c.name
          ORDER BY count(*) DESC, c.name ASC
          LIMIT 1
        ) AS "topCategory"
      FROM entities e
      WHERE e.user_id = $1
    `;

    if (filters?.type) {
      nodeQuery += ` AND e.type = $${paramIdx}`;
      params.push(filters.type);
      paramIdx += 1;
    }

    if (filters?.minMentions && filters.minMentions > 1) {
      // The HAVING-shape predicate has to live in a subquery (or be a
      // correlated subquery) because mentionCount is itself a subquery
      // in the SELECT list — Postgres doesn't allow referring to a
      // SELECT alias from WHERE. Re-emitting the count keeps the plan
      // obvious.
      nodeQuery += `
        AND (SELECT count(*) FROM article_entities ae WHERE ae.entity_id = e.id) >= $${paramIdx}
      `;
      params.push(filters.minMentions);
    }

    nodeQuery += ` ORDER BY e.canonical_name ASC`;
    const entityRows = (await this.dataSource.query(nodeQuery, params)) as EntityRow[];
    const entityIds = entityRows.map((r) => r.id);

    // Co-mention edges only between entities that survived the filter.
    // ANY($1) on a UUID array is the canonical pattern;
    // "ae2.entity_id > ae1.entity_id" collapses each unordered pair to
    // one row (min, max) and excludes self-pairs.
    let coMentionRows: EdgeRow[] = [];
    if (entityIds.length >= 2) {
      coMentionRows = (await this.dataSource.query(
        `SELECT
           ae1.entity_id AS source,
           ae2.entity_id AS target,
           count(*) AS weight
         FROM article_entities ae1
         INNER JOIN article_entities ae2
           ON ae2.article_id = ae1.article_id
           AND ae2.entity_id > ae1.entity_id
         WHERE ae1.entity_id = ANY($1)
           AND ae2.entity_id = ANY($1)
         GROUP BY ae1.entity_id, ae2.entity_id
         ORDER BY weight DESC`,
        [entityIds],
      )) as EdgeRow[];
    }

    // Article nodes + mentions edges — only when explicitly requested.
    // Importance DESC then published_at DESC so the cap takes the most
    // significant + most recent first. Mentions edges only connect
    // articles in this capped set to entities that survived the
    // entity filter (so no dangling edges in either direction).
    let articleNodes: ArticleGraphNode[] = [];
    let mentionRows: MentionRow[] = [];
    if (filters?.includeArticles) {
      const articleRows = (await this.dataSource.query(
        `SELECT
           a.id,
           a.title,
           a.importance,
           a.published_at AS "publishedAt",
           a.url_normalized AS url
         FROM articles a
         WHERE a.user_id = $1
           AND a.status = 'processed'
         ORDER BY
           CASE a.importance WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
           a.published_at DESC NULLS LAST
         LIMIT $2`,
        [userId, ARTICLE_NODE_CAP],
      )) as ArticleRow[];

      articleNodes = articleRows.map((r) => ({
        id: r.id,
        kind: 'article' as const,
        title: r.title,
        importance: r.importance,
        publishedAt:
          r.publishedAt instanceof Date ? r.publishedAt.toISOString() : (r.publishedAt ?? null),
        url: r.url,
      }));

      const articleIds = articleRows.map((r) => r.id);
      if (articleIds.length > 0 && entityIds.length > 0) {
        mentionRows = (await this.dataSource.query(
          `SELECT ae.article_id AS source, ae.entity_id AS target
           FROM article_entities ae
           WHERE ae.article_id = ANY($1)
             AND ae.entity_id = ANY($2)`,
          [articleIds, entityIds],
        )) as MentionRow[];
      }
    }

    const entityNodes: EntityGraphNode[] = entityRows.map((r) => ({
      id: r.id,
      kind: 'entity' as const,
      canonicalName: r.canonicalName,
      type: r.type,
      aliases: r.aliases ?? [],
      firstSeen: r.firstSeen instanceof Date ? r.firstSeen.toISOString() : r.firstSeen,
      lastSeen: r.lastSeen instanceof Date ? r.lastSeen.toISOString() : r.lastSeen,
      mentionCount: Number(r.mentionCount ?? 0),
      topCategory: r.topCategory ?? null,
    }));

    const coMentionEdges: GraphEdge[] = coMentionRows.map((r) => ({
      source: r.source,
      target: r.target,
      weight: Number(r.weight),
      kind: 'co_mention' as const,
    }));

    const mentionEdges: GraphEdge[] = mentionRows.map((r) => ({
      source: r.source,
      target: r.target,
      // mentions have no natural weight — each article either mentions
      // an entity or doesn't. weight=1 keeps the edge schema uniform.
      weight: 1,
      kind: 'mentions' as const,
    }));

    return {
      nodes: [...entityNodes, ...articleNodes],
      edges: [...coMentionEdges, ...mentionEdges],
    };
  }
}

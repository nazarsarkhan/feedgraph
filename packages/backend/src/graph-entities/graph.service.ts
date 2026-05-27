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
 */

export interface GraphFilters {
  type?: string;
  minMentions?: number;
}

export interface GraphNode {
  id: string;
  canonicalName: string;
  type: string;
  aliases: string[];
  firstSeen: string;
  lastSeen: string;
  mentionCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface NodeRow {
  id: string;
  canonicalName: string;
  type: string;
  aliases: string[] | null;
  firstSeen: Date | string;
  lastSeen: Date | string;
  mentionCount: string | number | null;
}

interface EdgeRow {
  source: string;
  target: string;
  weight: string | number;
}

@Injectable()
export class GraphService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getGraph(
    userId: string,
    filters?: GraphFilters,
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    // Nodes: every entity for this user, optionally narrowed by type and
    // mentionCount threshold. Each filter appends a parameterized clause
    // — no string interpolation of filter values.
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
          AS "mentionCount"
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
      // correlated subquery) because mentionCount is itself a subquery in
      // the SELECT list — Postgres doesn't allow referring to a SELECT
      // alias from WHERE. Re-emitting the count keeps the plan obvious.
      nodeQuery += `
        AND (SELECT count(*) FROM article_entities ae WHERE ae.entity_id = e.id) >= $${paramIdx}
      `;
      params.push(filters.minMentions);
    }

    nodeQuery += ` ORDER BY e.canonical_name ASC`;
    const nodeRows = (await this.dataSource.query(nodeQuery, params)) as NodeRow[];

    // Edges only between nodes that survived the filter. ANY($1) on a
    // UUID array is the canonical pattern; "ae2.entity_id > ae1.entity_id"
    // collapses each unordered pair to one row (min, max) and excludes
    // self-pairs. If <2 nodes survived, there can be no edges.
    let edgeRows: EdgeRow[] = [];
    const nodeIds = nodeRows.map((r) => r.id);
    if (nodeIds.length >= 2) {
      edgeRows = (await this.dataSource.query(
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
        [nodeIds],
      )) as EdgeRow[];
    }

    return {
      nodes: nodeRows.map((r) => ({
        id: r.id,
        canonicalName: r.canonicalName,
        type: r.type,
        aliases: r.aliases ?? [],
        firstSeen: r.firstSeen instanceof Date ? r.firstSeen.toISOString() : r.firstSeen,
        lastSeen: r.lastSeen instanceof Date ? r.lastSeen.toISOString() : r.lastSeen,
        mentionCount: Number(r.mentionCount ?? 0),
      })),
      edges: edgeRows.map((r) => ({
        source: r.source,
        target: r.target,
        weight: Number(r.weight),
      })),
    };
  }
}

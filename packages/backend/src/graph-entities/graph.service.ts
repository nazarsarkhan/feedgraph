import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Multi-tenant contract: getGraph takes userId as the first param and
 * every JOIN/WHERE filters by user_id. The graph endpoint returns the
 * full graph for this user in one round trip — no pagination, because
 * the visual UI needs everything at once and entity counts are small
 * (~10k upper bound per user at MVP scale).
 */

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

  async getGraph(userId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    // Nodes: every entity for this user with its mentionCount projected
    // via a correlated subquery (same pattern as EntitiesListService).
    const nodeRows = (await this.dataSource
      .createQueryBuilder()
      .select('e.id', 'id')
      .addSelect('e.canonical_name', 'canonicalName')
      .addSelect('e.type', 'type')
      .addSelect('e.aliases', 'aliases')
      .addSelect('e.first_seen', 'firstSeen')
      .addSelect('e.last_seen', 'lastSeen')
      .addSelect(
        (sub) => sub.select('count(*)').from('article_entities', 'ae').where('ae.entity_id = e.id'),
        'mentionCount',
      )
      .from('entities', 'e')
      .where('e.user_id = :userId', { userId })
      .orderBy('e.canonical_name', 'ASC')
      .getRawMany()) as NodeRow[];

    // Edges: self-join article_entities on the same article_id. The
    // ae2.entity_id > ae1.entity_id predicate keeps exactly one row
    // per unordered pair (the (A,B) form, never the duplicate (B,A)),
    // and excludes self-pairs. INNER JOIN to entities for both ends
    // enforces tenancy — if either entity isn't this user's, the
    // pair drops.
    const edgeRows = (await this.dataSource
      .createQueryBuilder()
      .select('ae1.entity_id', 'source')
      .addSelect('ae2.entity_id', 'target')
      .addSelect('count(*)', 'weight')
      .from('article_entities', 'ae1')
      .innerJoin(
        'article_entities',
        'ae2',
        'ae2.article_id = ae1.article_id AND ae2.entity_id > ae1.entity_id',
      )
      .innerJoin('entities', 'e1', 'e1.id = ae1.entity_id AND e1.user_id = :userId', {
        userId,
      })
      .innerJoin('entities', 'e2', 'e2.id = ae2.entity_id AND e2.user_id = :userId', {
        userId,
      })
      .groupBy('ae1.entity_id')
      .addGroupBy('ae2.entity_id')
      .orderBy('weight', 'DESC')
      .getRawMany()) as EdgeRow[];

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

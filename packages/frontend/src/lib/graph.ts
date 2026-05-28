import { api } from './api';
import type { EntityType } from './entities';

// Two-kind node model. Discriminate by `kind` so consumers (layout +
// click handler + hover) can branch type-safely. Entity nodes are the
// default; article nodes are opt-in via `includeArticles=true`.
export type NodeKind = 'entity' | 'article';

export interface EntityGraphNode {
  id: string;
  kind: 'entity';
  canonicalName: string;
  type: EntityType;
  aliases: string[];
  firstSeen: string;
  lastSeen: string;
  mentionCount: number;
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

// `co_mention` connects two entities that appeared in the same article
// (weighted by co-mention count). `mentions` connects an article to
// every entity it references (always weight=1).
export type EdgeKind = 'co_mention' | 'mentions';

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  kind: EdgeKind;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphFilters {
  type?: EntityType;
  minMentions?: number;
  // View toggle — when true, the response carries up to 30 article
  // nodes (top by importance + recency) plus their mentions edges to
  // the filtered entity set. Default false to keep the entity-only
  // view fast on first load.
  includeArticles?: boolean;
}

export const graphApi = {
  get: (filters?: GraphFilters): Promise<GraphData> => {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.minMentions) params.set('minMentions', String(filters.minMentions));
    if (filters?.includeArticles) params.set('includeArticles', 'true');
    const qs = params.toString();
    return api.get<GraphData>(`/graph${qs ? `?${qs}` : ''}`);
  },
};

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
  // The category most-assigned to articles that mention this entity,
  // computed server-side. null when the entity has no categorised
  // articles. Drives the Graph page's "Color by: category" toggle.
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

// `co_mention` connects two entities that appeared in the same article
// (weighted by co-mention count). `mentions` connects an article to
// every entity it references (always weight=1). `similar` connects
// two article nodes with a cosine-similarity score above the backend
// threshold (0.82) — populated only when both endpoints have an
// embedding in `article_embeddings`.
export type EdgeKind = 'co_mention' | 'mentions' | 'similar';

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  kind: EdgeKind;
  // Earliest article timestamp that created this edge, in Unix
  // seconds. For co_mention: MIN(published_at) across all linking
  // articles. For mentions: the article's published_at. null when
  // the underlying article(s) have no published_at — the timeline
  // filter treats null as "always visible" so edges aren't lost on
  // RSS feeds that omit pubDate. similar edges set this to null
  // since they're not pinned to a specific article timestamp.
  minPublishedAt: number | null;
  // Cosine similarity in [0, 1] — present only on kind='similar'
  // edges. The backend filters by score >= 0.82 before sending.
  score?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// 'type' (default) colors entity circles by EntityType (the long-
// standing palette in EntityNode.TYPE_COLORS). 'category' tints
// circles by their topCategory via a deterministic hash-based palette
// in lib/graph-layout — same name always picks the same color.
export type GraphColorBy = 'type' | 'category';

export interface GraphFilters {
  type?: EntityType;
  minMentions?: number;
  // View toggle — when true, the response carries up to 30 article
  // nodes (top by importance + recency) plus their mentions edges to
  // the filtered entity set. Default false to keep the entity-only
  // view fast on first load.
  includeArticles?: boolean;
  // View mode for node coloring. Default 'type' so the existing
  // behaviour is unchanged when no param is present.
  colorBy?: GraphColorBy;
  // When true, co_mention edges paint with an animated dashed flow
  // from the older entity (lower `firstSeen`) toward the newer one,
  // plus an arrow marker at the target. mentions edges are unaffected
  // (they're directional by nature: article → entity; animating them
  // would clutter the canvas with little informational value). Default
  // off so the existing static look is unchanged.
  animate?: boolean;
  // Substring match on canonical_name (backend `ILIKE`). Narrows the
  // visible graph to matching entities; edges are recomputed against
  // the surviving node set server-side.
  q?: string;
  // Time window — show only entities seen in the last N days
  // (backend `last_seen >= now() - interval`). Undefined = all time.
  days?: number;
}

export const graphApi = {
  get: (filters?: GraphFilters): Promise<GraphData> => {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.minMentions) params.set('minMentions', String(filters.minMentions));
    if (filters?.includeArticles) params.set('includeArticles', 'true');
    if (filters?.q) params.set('q', filters.q);
    if (filters?.days) params.set('days', String(filters.days));
    const qs = params.toString();
    return api.get<GraphData>(`/graph${qs ? `?${qs}` : ''}`);
  },
};

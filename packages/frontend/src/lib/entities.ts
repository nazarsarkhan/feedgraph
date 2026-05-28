import { api } from './api';

export type EntityType = 'person' | 'company' | 'product' | 'technology' | 'location';
export type EntitySortBy = 'lastSeen' | 'mentionCount' | 'name';
export type SortOrder = 'asc' | 'desc';

export interface EntityListItem {
  id: string;
  canonicalName: string;
  type: EntityType;
  aliases: string[];
  description: string | null;
  firstSeen: string;
  lastSeen: string;
  mentionCount: number;
}

export interface MentioningArticle {
  id: string;
  title: string | null;
  feedName: string | null;
  publishedAt: string | null;
}

export interface RelatedEntity {
  id: string;
  canonicalName: string;
  type: EntityType;
  coMentionCount: number;
}

export interface MentionTimelinePoint {
  date: string;
  count: number;
}

export interface EntityDetail extends EntityListItem {
  mentioningArticles: MentioningArticle[];
  relatedEntities: RelatedEntity[];
  mentionTimeline: MentionTimelinePoint[];
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface EntityListResponse {
  items: EntityListItem[];
  pagination: PaginationMeta;
}

export interface EntityFilters {
  type?: EntityType;
  q?: string;
  minMentions?: number;
  page?: number;
  pageSize?: number;
  sortBy?: EntitySortBy;
  order?: SortOrder;
}

function buildQuery(f: EntityFilters): string {
  const params = new URLSearchParams();
  if (f.type) params.set('type', f.type);
  if (f.q) params.set('q', f.q);
  if (f.minMentions) params.set('minMentions', String(f.minMentions));
  if (f.page) params.set('page', String(f.page));
  if (f.pageSize) params.set('pageSize', String(f.pageSize));
  if (f.sortBy) params.set('sortBy', f.sortBy);
  if (f.order) params.set('order', f.order);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export interface DeduplicateResult {
  entitiesConsidered: number;
  groupsFound: number;
  entitiesMerged: number;
}

export const entitiesApi = {
  list: (filters: EntityFilters): Promise<EntityListResponse> =>
    api.get<EntityListResponse>(`/entities${buildQuery(filters)}`),
  detail: (id: string): Promise<EntityDetail> => api.get<EntityDetail>(`/entities/${id}`),
  deduplicate: (): Promise<DeduplicateResult> =>
    api.post<DeduplicateResult>('/entities/deduplicate'),
};

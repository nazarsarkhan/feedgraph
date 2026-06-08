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

export interface MentioningArticlesResponse {
  items: MentioningArticle[];
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
  batches: number;
}

// Live per-batch progress reported by the dedup worker.
export interface DedupProgress {
  processedEntities: number;
  totalEntities: number;
  batchesDone: number;
  totalBatches: number;
  groupsFound: number;
  entitiesMerged: number;
}

// Mirrors the backend BullMQ job states the status endpoint can return.
export type DedupJobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'
  | 'waiting-children'
  | 'prioritized'
  | 'unknown';

export interface DedupJobStatus {
  jobId: string;
  state: DedupJobState;
  progress: DedupProgress | null;
  result: DeduplicateResult | null;
  error: string | null;
}

// A job is settled (no more polling) once it has completed or failed. 'unknown'
// means BullMQ evicted the job — also terminal as far as polling is concerned.
export function isDedupJobSettled(state: DedupJobState): boolean {
  return state === 'completed' || state === 'failed' || state === 'unknown';
}

// Human label for the toast shown when a dedup job finishes successfully.
export function dedupResultMessage(result: DeduplicateResult): string {
  if (result.groupsFound === 0) {
    return `No duplicates found (analysed ${result.entitiesConsidered} entities).`;
  }
  const ent = result.entitiesMerged === 1 ? 'entity' : 'entities';
  const grp = result.groupsFound === 1 ? 'group' : 'groups';
  return `Merged ${result.entitiesMerged} duplicate ${ent} into ${result.groupsFound} ${grp}.`;
}

export const entitiesApi = {
  list: (filters: EntityFilters): Promise<EntityListResponse> =>
    api.get<EntityListResponse>(`/entities${buildQuery(filters)}`),
  detail: (id: string): Promise<EntityDetail> => api.get<EntityDetail>(`/entities/${id}`),
  // Paginated "all articles mentioning this entity" — the see-all companion
  // to the capped list on the detail page.
  articles: (id: string, page: number, pageSize: number): Promise<MentioningArticlesResponse> =>
    api.get<MentioningArticlesResponse>(
      `/entities/${id}/articles?page=${page}&pageSize=${pageSize}`,
    ),
  // Enqueues an async dedup job; returns the job id to poll. The actual
  // matchEntities work runs on a BullMQ worker (backend returns 202).
  deduplicate: (): Promise<{ jobId: string }> =>
    api.post<{ jobId: string }>('/entities/deduplicate'),
  dedupStatus: (jobId: string): Promise<DedupJobStatus> =>
    api.get<DedupJobStatus>(`/entities/deduplicate/${jobId}`),
};

import { api } from './api';

export type ArticleStatus = 'raw' | 'filtered' | 'pending_llm' | 'processed' | 'error';
export type ArticleImportance = 'high' | 'normal';
export type ArticleSortBy = 'publishedAt' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface ArticleEntity {
  name: string;
  type: string;
}

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
  entities: ArticleEntity[];
  categories: string[];
  similarCount: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ArticleListResponse {
  items: ArticleListItem[];
  pagination: PaginationMeta;
}

export interface ArticleFilters {
  status?: ArticleStatus;
  importance?: ArticleImportance;
  feedId?: string;
  category?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sortBy?: ArticleSortBy;
  order?: SortOrder;
}

function buildQuery(f: ArticleFilters): string {
  const params = new URLSearchParams();
  if (f.status) params.set('status', f.status);
  if (f.importance) params.set('importance', f.importance);
  if (f.feedId) params.set('feedId', f.feedId);
  if (f.category) params.set('category', f.category);
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  if (f.page) params.set('page', String(f.page));
  if (f.pageSize) params.set('pageSize', String(f.pageSize));
  if (f.sortBy) params.set('sortBy', f.sortBy);
  if (f.order) params.set('order', f.order);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const articlesApi = {
  list: (filters: ArticleFilters): Promise<ArticleListResponse> =>
    api.get<ArticleListResponse>(`/articles${buildQuery(filters)}`),
};

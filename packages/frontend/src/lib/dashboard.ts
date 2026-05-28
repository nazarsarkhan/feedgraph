import { api } from './api';

export interface DashboardStats {
  totalArticles: number;
  highImportance: number;
  filtered: number;
}

export interface DashboardTopEntity {
  id: string;
  canonicalName: string;
  type: string;
  mentionCount: number;
}

export interface DashboardTopCategory {
  name: string;
  articleCount: number;
}

export interface DashboardTopFeed {
  name: string;
  articleCount: number;
}

export interface DashboardSummary {
  period: { from: string; to: string };
  stats: DashboardStats;
  topEntities: DashboardTopEntity[];
  topCategories: DashboardTopCategory[];
  topFeed: DashboardTopFeed | null;
}

export const dashboardApi = {
  summary: (from?: string, to?: string): Promise<DashboardSummary> => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return api.get<DashboardSummary>(`/dashboard/summary${qs ? `?${qs}` : ''}`);
  },
};

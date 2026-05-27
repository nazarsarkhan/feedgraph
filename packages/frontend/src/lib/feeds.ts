import { api } from './api';

export type FeedStatus = 'active' | 'paused' | 'error';

export interface Feed {
  id: string;
  userId: string;
  url: string;
  name: string | null;
  status: FeedStatus;
  lastPolledAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export const feedsApi = {
  list: (): Promise<Feed[]> => api.get<Feed[]>('/feeds'),
  create: (body: { url: string; name?: string }): Promise<Feed> => api.post<Feed>('/feeds', body),
  pause: (id: string): Promise<Feed> => api.patch<Feed>(`/feeds/${id}/pause`),
  resume: (id: string): Promise<Feed> => api.patch<Feed>(`/feeds/${id}/resume`),
  remove: (id: string): Promise<void> => api.delete<void>(`/feeds/${id}`),
  pollNow: (id: string): Promise<{ message: string; feedId: string }> =>
    api.post<{ message: string; feedId: string }>(`/feeds/${id}/poll-now`),
};

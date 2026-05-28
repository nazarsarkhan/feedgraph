import { api } from './api';

export type DigestPeriodType = 'day' | 'week' | 'month';
export type DigestSentiment = 'positive' | 'negative' | 'neutral' | 'mixed';

export interface DigestItem {
  id: string;
  periodType: DigestPeriodType;
  // The backend returns DATE columns as YYYY-MM-DD strings.
  periodStart: string;
  periodEnd: string;
  summary: string;
  keyThemes: string[];
  topEntities: string[];
  articleCount: number;
  sentiment: DigestSentiment | null;
  createdAt: string;
}

export interface GenerateDigestArgs {
  periodType: DigestPeriodType;
  // Any calendar date inside the desired period; the backend computes
  // the canonical period bounds from this.
  date: string;
}

export const digestsApi = {
  list: (): Promise<DigestItem[]> => api.get<DigestItem[]>('/digests'),
  generate: (args: GenerateDigestArgs): Promise<DigestItem> =>
    api.post<DigestItem>('/digests/generate', args),
  get: (id: string): Promise<DigestItem> => api.get<DigestItem>(`/digests/${id}`),
};

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

// POST /digests/generate either returns the already-stored digest (the snappy
// idempotent fast path, no LLM) or enqueues a DIGEST job and returns its id to
// poll. Discriminated on `status` so the caller branches cleanly.
export type GenerateDigestResponse =
  | { status: 'existing'; digest: DigestItem }
  | { status: 'enqueued'; jobId: string };

// Mirrors the backend BullMQ job states the status endpoint can return.
export type DigestJobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused'
  | 'waiting-children'
  | 'prioritized'
  | 'unknown';

export interface DigestJobStatus {
  jobId: string;
  state: DigestJobState;
  // The generated digest once the job completes.
  result: DigestItem | null;
  error: string | null;
}

// A job is settled (no more polling) once it has completed or failed. 'unknown'
// means BullMQ evicted the job — also terminal as far as polling is concerned.
export function isDigestJobSettled(state: DigestJobState): boolean {
  return state === 'completed' || state === 'failed' || state === 'unknown';
}

export const digestsApi = {
  list: (): Promise<DigestItem[]> => api.get<DigestItem[]>('/digests'),
  // Returns either the existing digest (fast path) or a jobId to poll. The
  // buildDigest LLM call runs on a BullMQ worker when a new digest is needed.
  generate: (args: GenerateDigestArgs): Promise<GenerateDigestResponse> =>
    api.post<GenerateDigestResponse>('/digests/generate', args),
  generateStatus: (jobId: string): Promise<DigestJobStatus> =>
    api.get<DigestJobStatus>(`/digests/generate/${jobId}`),
  get: (id: string): Promise<DigestItem> => api.get<DigestItem>(`/digests/${id}`),
};

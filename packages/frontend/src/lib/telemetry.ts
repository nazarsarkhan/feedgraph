import { api } from './api';

export interface TelemetrySummary {
  totalCalls: number;
  totalTokens: number;
  cacheHitRate: number;
  failoverRate: number;
  successRate: number;
  byProvider: { provider: string; calls: number; tokens: number; successRate: number }[];
  byOperation: { operation: string; calls: number; tokens: number }[];
  tokenTimeline: { date: string; tokens: number }[];
}

export interface TelemetryRecentRow {
  id: string;
  provider: string;
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  cacheHit: boolean;
  success: boolean;
  failoverFrom: string | null;
  errorMessage: string | null;
  createdAt: string;
}

// Optional date range for the summary. Both are ISO 8601 (the picker emits
// day-boundary timestamps). Omitted → backend's default last-14-days window.
export interface TelemetryRange {
  from?: string;
  to?: string;
}

function buildRangeQuery(range?: TelemetryRange): string {
  const params = new URLSearchParams();
  if (range?.from) params.set('from', range.from);
  if (range?.to) params.set('to', range.to);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const telemetryApi = {
  summary: (range?: TelemetryRange): Promise<TelemetrySummary> =>
    api.get<TelemetrySummary>(`/telemetry/summary${buildRangeQuery(range)}`),
  // Admin-only: system-wide usage across all users (403 for non-admins).
  adminSummary: (range?: TelemetryRange): Promise<TelemetrySummary> =>
    api.get<TelemetrySummary>(`/telemetry/admin/summary${buildRangeQuery(range)}`),
  recent: (): Promise<TelemetryRecentRow[]> => api.get<TelemetryRecentRow[]>('/telemetry/recent'),
};

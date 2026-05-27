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

export const telemetryApi = {
  summary: (): Promise<TelemetrySummary> => api.get<TelemetrySummary>('/telemetry/summary'),
  recent: (): Promise<TelemetryRecentRow[]> => api.get<TelemetryRecentRow[]>('/telemetry/recent'),
};

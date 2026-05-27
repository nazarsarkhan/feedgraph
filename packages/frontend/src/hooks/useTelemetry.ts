import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { telemetryApi, type TelemetryRecentRow, type TelemetrySummary } from '@/lib/telemetry';

export function useTelemetrySummary() {
  return useQuery<TelemetrySummary, ApiException>({
    queryKey: ['telemetry', 'summary'],
    queryFn: telemetryApi.summary,
    staleTime: 30_000,
  });
}

export function useTelemetryRecent() {
  return useQuery<TelemetryRecentRow[], ApiException>({
    queryKey: ['telemetry', 'recent'],
    queryFn: telemetryApi.recent,
    staleTime: 30_000,
  });
}

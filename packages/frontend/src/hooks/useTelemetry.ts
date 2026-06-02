import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import {
  telemetryApi,
  type TelemetryRange,
  type TelemetryRecentRow,
  type TelemetrySummary,
} from '@/lib/telemetry';

export function useTelemetrySummary(range?: TelemetryRange) {
  return useQuery<TelemetrySummary, ApiException>({
    // Range is part of the key so switching windows refetches and caches
    // each window independently.
    queryKey: ['telemetry', 'summary', range?.from ?? null, range?.to ?? null],
    queryFn: () => telemetryApi.summary(range),
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

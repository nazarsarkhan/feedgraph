import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import {
  telemetryApi,
  type TelemetryRange,
  type TelemetryRecentRow,
  type TelemetrySummary,
} from '@/lib/telemetry';

export function useTelemetrySummary(range?: TelemetryRange, opts?: { admin?: boolean }) {
  const admin = opts?.admin ?? false;
  return useQuery<TelemetrySummary, ApiException>({
    // Range AND scope are part of the key so switching windows or flipping
    // between own/all-users refetches and caches each combination independently.
    queryKey: [
      'telemetry',
      'summary',
      admin ? 'all' : 'me',
      range?.from ?? null,
      range?.to ?? null,
    ],
    queryFn: () => (admin ? telemetryApi.adminSummary(range) : telemetryApi.summary(range)),
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

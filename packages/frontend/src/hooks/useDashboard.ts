import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { dashboardApi, type DashboardSummary } from '@/lib/dashboard';

export function useDashboardSummary(from: string, to: string) {
  return useQuery<DashboardSummary, ApiException>({
    queryKey: ['dashboard', 'summary', from, to],
    queryFn: () => dashboardApi.summary(from, to),
    // Aggregations don't change rapidly — staleTime smooths the
    // refetch when the user toggles between 7d / 14d / 30d and
    // back.
    staleTime: 60_000,
  });
}

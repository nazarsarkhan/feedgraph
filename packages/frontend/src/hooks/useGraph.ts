import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { graphApi, type GraphData, type GraphFilters } from '@/lib/graph';

export function useGraph(filters?: GraphFilters) {
  return useQuery<GraphData, ApiException>({
    queryKey: ['graph', filters ?? {}],
    queryFn: () => graphApi.get(filters),
    // Graph data changes infrequently (only on new article processing).
    // 60s stale time avoids refetching on every revisit to /graph.
    staleTime: 60_000,
    // Smooth filter transitions — keep the previous graph painted while
    // the next one loads instead of flashing the empty canvas.
    placeholderData: keepPreviousData,
  });
}

import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { graphApi, type GraphData } from '@/lib/graph';

export function useGraph() {
  return useQuery<GraphData, ApiException>({
    queryKey: ['graph'],
    queryFn: graphApi.get,
    // Graph data changes infrequently (only on new article processing).
    // 60s stale time avoids refetching on every revisit to /graph.
    staleTime: 60_000,
  });
}

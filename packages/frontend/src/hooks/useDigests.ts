import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { digestsApi, type DigestItem } from '@/lib/digests';

export function useDigests() {
  return useQuery<DigestItem[], ApiException>({
    queryKey: ['digests'],
    queryFn: digestsApi.list,
    // List rarely changes between visits — most-recent-first ordering
    // doesn't shift unless the user generates a new one (which itself
    // invalidates the query). 60s staleTime is a comfortable default.
    staleTime: 60_000,
  });
}

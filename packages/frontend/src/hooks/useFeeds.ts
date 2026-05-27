import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { feedsApi, type Feed } from '@/lib/feeds';

export function useFeeds() {
  return useQuery<Feed[], ApiException>({
    queryKey: ['feeds'],
    queryFn: feedsApi.list,
  });
}

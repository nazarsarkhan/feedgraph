import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { entitiesApi, type MentioningArticlesResponse } from '@/lib/entities';

export function useEntityArticles(id: string | undefined, page: number, pageSize: number) {
  return useQuery<MentioningArticlesResponse, ApiException>({
    queryKey: ['entity', id, 'articles', page, pageSize],
    queryFn: () => entitiesApi.articles(id!, page, pageSize),
    enabled: !!id,
    // Keep the current page painted while the next loads — no empty flash
    // when the user pages through.
    placeholderData: keepPreviousData,
  });
}

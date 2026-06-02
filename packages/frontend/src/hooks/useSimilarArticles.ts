import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { articlesApi, type SimilarArticlesResponse } from '@/lib/articles';
import { ApiException } from '@/lib/api';

export function useSimilarArticles(id: string | undefined, page: number, pageSize: number) {
  return useQuery<SimilarArticlesResponse, ApiException>({
    queryKey: ['article', id, 'similar', page, pageSize],
    queryFn: () => articlesApi.similar(id!, page, pageSize),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

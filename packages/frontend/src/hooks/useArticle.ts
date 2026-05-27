import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { articlesApi, type ArticleDetail } from '@/lib/articles';

export function useArticle(id: string | undefined) {
  return useQuery<ArticleDetail, ApiException>({
    queryKey: ['article', id],
    queryFn: () => articlesApi.detail(id!),
    enabled: !!id,
    retry: (failureCount, error) => {
      // 404 is terminal — don't retry; the page renders a not-found view.
      if (error instanceof ApiException && error.status === 404) return false;
      return failureCount < 3;
    },
  });
}

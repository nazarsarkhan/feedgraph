import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { articlesApi, type ArticleListResponse } from '@/lib/articles';

// Reuses the existing list endpoint with pageSize=1 so we share the
// query cache with whatever the articles page is doing, and avoid a
// dedicated count endpoint. `select` projects the total from pagination
// without retaining the items in the consumer.
export function useProcessedArticleCount() {
  return useQuery<ArticleListResponse, ApiException, number>({
    queryKey: ['articles', { status: 'processed', pageSize: 1 }],
    queryFn: () => articlesApi.list({ status: 'processed', pageSize: 1 }),
    select: (data) => data.pagination.total,
  });
}

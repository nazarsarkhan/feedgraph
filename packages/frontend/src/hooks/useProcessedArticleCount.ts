import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { articlesApi, type ArticleListResponse } from '@/lib/articles';

// Reuses the existing list endpoint with pageSize=1 so we share the
// query cache with whatever the articles page is doing, and avoid a
// dedicated count endpoint. `select` projects the total from pagination
// without retaining the items in the consumer. The query key shares
// the ['articles', …] prefix the regenerate mutation invalidates, so
// the counts auto-refresh when regenerate completes.

export function useProcessedArticleCount() {
  return useQuery<ArticleListResponse, ApiException, number>({
    queryKey: ['articles', { status: 'processed', pageSize: 1 }],
    queryFn: () => articlesApi.list({ status: 'processed', pageSize: 1 }),
    select: (data) => data.pagination.total,
  });
}

// Pending-LLM count powers the "unstick me" half of the regenerate UX:
// if reset count is 0 but stuck count > 0, the button must still be
// clickable (the endpoint re-enqueues stuck pending_llm articles too).
export function usePendingLlmArticleCount() {
  return useQuery<ArticleListResponse, ApiException, number>({
    queryKey: ['articles', { status: 'pending_llm', pageSize: 1 }],
    queryFn: () => articlesApi.list({ status: 'pending_llm', pageSize: 1 }),
    select: (data) => data.pagination.total,
  });
}

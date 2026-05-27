import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { articlesApi, type ArticleFilters, type ArticleListResponse } from '@/lib/articles';

export function useArticles(filters: ArticleFilters) {
  return useQuery<ArticleListResponse, ApiException>({
    queryKey: ['articles', filters],
    queryFn: () => articlesApi.list(filters),
    // keepPreviousData (TanStack v5: placeholderData: keepPreviousData)
    // smooths filter / pagination transitions — the previous page stays
    // visible until the new query resolves instead of flashing empty.
    placeholderData: keepPreviousData,
  });
}

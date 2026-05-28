import { useMemo } from 'react';
import type { ArticleFilters, ArticleSortBy, SortOrder } from '@/lib/articles';
import { pickEnum, useUrlFilters } from './useUrlFilters';

const STATUS_VALUES = ['raw', 'filtered', 'pending_llm', 'processed', 'error'] as const;
const IMPORTANCE_VALUES = ['high', 'normal'] as const;
const SORT_BY_VALUES = ['publishedAt', 'createdAt'] as const;
const ORDER_VALUES = ['asc', 'desc'] as const;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT_BY: ArticleSortBy = 'publishedAt';
const DEFAULT_ORDER: SortOrder = 'desc';

/**
 * Thin wrapper around `useUrlFilters<ArticleFilters>` — the URL is the
 * single source of truth and `setFilter` resets `page` on any non-page
 * change. See useUrlFilters for the shared mechanics.
 */
export function useArticleFilters() {
  // Options MUST be memoized so its identity is stable across renders —
  // see useUrlFilters for why. Empty dep array because all references
  // inside the parse/countActive functions are module-level constants.
  const options = useMemo(
    () => ({
      parse: (params: URLSearchParams): ArticleFilters => ({
        status: pickEnum(params.get('status'), STATUS_VALUES),
        importance: pickEnum(params.get('importance'), IMPORTANCE_VALUES),
        feedId: params.get('feedId') ?? undefined,
        category: params.get('category') ?? undefined,
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
        page: Number(params.get('page')) || 1,
        pageSize: Number(params.get('pageSize')) || DEFAULT_PAGE_SIZE,
        sortBy: pickEnum(params.get('sortBy'), SORT_BY_VALUES) ?? DEFAULT_SORT_BY,
        order: pickEnum(params.get('order'), ORDER_VALUES) ?? DEFAULT_ORDER,
      }),
      // Sort, page, and pageSize don't count toward "active filters" — they
      // shape the view but aren't user-facing filter selections.
      countActive: (f: ArticleFilters): number => {
        let n = 0;
        if (f.status) n++;
        if (f.importance) n++;
        if (f.feedId) n++;
        if (f.category) n++;
        if (f.from) n++;
        if (f.to) n++;
        return n;
      },
    }),
    [],
  );

  return useUrlFilters<ArticleFilters>(options);
}

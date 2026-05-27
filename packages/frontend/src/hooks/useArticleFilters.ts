import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  ArticleFilters,
  ArticleImportance,
  ArticleSortBy,
  ArticleStatus,
  SortOrder,
} from '@/lib/articles';

const STATUS_VALUES = ['raw', 'filtered', 'pending_llm', 'processed', 'error'] as const;
const IMPORTANCE_VALUES = ['high', 'normal'] as const;
const SORT_BY_VALUES = ['publishedAt', 'createdAt'] as const;
const ORDER_VALUES = ['asc', 'desc'] as const;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT_BY: ArticleSortBy = 'publishedAt';
const DEFAULT_ORDER: SortOrder = 'desc';

function pickEnum<T extends readonly string[]>(
  value: string | null,
  allowed: T,
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

/**
 * URL is the single source of truth for the filter state. The component
 * tree consumes `filters`; mutations go through `setFilter` which both
 * (a) reflects the change in the URL via setSearchParams, and (b) resets
 * `page` to 1 whenever a non-page filter changes — standard list UX.
 *
 * `setSearchParams` uses { replace: true } so the browser history isn't
 * flooded with every keystroke / dropdown change. The user can still
 * bookmark or share the URL — the current state is always reflected.
 */
export function useArticleFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: ArticleFilters = useMemo(
    () => ({
      status: pickEnum<typeof STATUS_VALUES>(searchParams.get('status'), STATUS_VALUES) as
        | ArticleStatus
        | undefined,
      importance: pickEnum<typeof IMPORTANCE_VALUES>(
        searchParams.get('importance'),
        IMPORTANCE_VALUES,
      ) as ArticleImportance | undefined,
      feedId: searchParams.get('feedId') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      page: Number(searchParams.get('page')) || 1,
      pageSize: Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE,
      sortBy:
        (pickEnum<typeof SORT_BY_VALUES>(searchParams.get('sortBy'), SORT_BY_VALUES) as
          | ArticleSortBy
          | undefined) ?? DEFAULT_SORT_BY,
      order:
        (pickEnum<typeof ORDER_VALUES>(searchParams.get('order'), ORDER_VALUES) as
          | SortOrder
          | undefined) ?? DEFAULT_ORDER,
    }),
    [searchParams],
  );

  const setFilter = useCallback(
    <K extends keyof ArticleFilters>(key: K, value: ArticleFilters[K]): void => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === undefined || value === null || value === '') {
            next.delete(key as string);
          } else {
            next.set(key as string, String(value));
          }
          // Any non-page change resets pagination to 1 (i.e. drop the param).
          if (key !== 'page') {
            next.delete('page');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const reset = useCallback((): void => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  // Count of filters set beyond defaults (sort + page + pageSize don't count).
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.status) n++;
    if (filters.importance) n++;
    if (filters.feedId) n++;
    if (filters.category) n++;
    if (filters.from) n++;
    if (filters.to) n++;
    return n;
  }, [filters]);

  return { filters, setFilter, reset, activeFilterCount };
}

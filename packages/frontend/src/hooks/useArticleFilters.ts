import { useCallback, useMemo } from 'react';
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs';
import type {
  ArticleFilters,
  ArticleImportance,
  ArticleSortBy,
  ArticleStatus,
  SortOrder,
} from '@/lib/articles';

const STATUS_VALUES: ArticleStatus[] = ['raw', 'filtered', 'pending_llm', 'processed', 'error'];
const IMPORTANCE_VALUES: ArticleImportance[] = ['high', 'normal'];
const SORT_BY_VALUES: ArticleSortBy[] = ['publishedAt', 'createdAt'];
const ORDER_VALUES: SortOrder[] = ['asc', 'desc'];
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT_BY: ArticleSortBy = 'publishedAt';
const DEFAULT_ORDER: SortOrder = 'desc';

/**
 * Articles list filters, URL as source of truth — now backed by nuqs.
 *
 * nuqs owns serialization: enum params validate against a closed set (an
 * invalid value reads as null → the field's default), and `clearOnDefault`
 * (nuqs default) drops any param equal to its default so the URL stays clean.
 * The page-reset rule (any non-`page` change returns to page 1) is app
 * behaviour nuqs doesn't provide, so the wrapper applies it. nuqs batches
 * concurrent setter calls in one tick, so the two `setFilter` calls the sort
 * control fires (sortBy + order) compose into a single URL update.
 */
const PARSERS = {
  q: parseAsString,
  status: parseAsStringEnum<ArticleStatus>(STATUS_VALUES),
  importance: parseAsStringEnum<ArticleImportance>(IMPORTANCE_VALUES),
  feedId: parseAsString,
  category: parseAsString,
  from: parseAsString,
  to: parseAsString,
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
  sortBy: parseAsStringEnum<ArticleSortBy>(SORT_BY_VALUES).withDefault(DEFAULT_SORT_BY),
  order: parseAsStringEnum<SortOrder>(ORDER_VALUES).withDefault(DEFAULT_ORDER),
};

export function useArticleFilters() {
  const [values, setValues] = useQueryStates(PARSERS);

  // Map nuqs's nullable values to the ArticleFilters shape (absent optional
  // fields are `undefined`, not null). Memoized on the primitive values so a
  // new `values` object identity alone doesn't churn the snapshot.
  const filters = useMemo<ArticleFilters>(
    () => ({
      q: values.q ?? undefined,
      status: values.status ?? undefined,
      importance: values.importance ?? undefined,
      feedId: values.feedId ?? undefined,
      category: values.category ?? undefined,
      from: values.from ?? undefined,
      to: values.to ?? undefined,
      page: values.page,
      pageSize: values.pageSize,
      sortBy: values.sortBy,
      order: values.order,
    }),
    [
      values.q,
      values.status,
      values.importance,
      values.feedId,
      values.category,
      values.from,
      values.to,
      values.page,
      values.pageSize,
      values.sortBy,
      values.order,
    ],
  );

  const setFilter = useCallback(
    <K extends keyof ArticleFilters>(key: K, value: ArticleFilters[K]): void => {
      // null clears the param from the URL; any non-page change resets page.
      const patch: Record<string, ArticleFilters[keyof ArticleFilters] | null> = {
        [key]: value === undefined || value === '' ? null : value,
      };
      if (key !== 'page') patch.page = null;
      void setValues(patch as Parameters<typeof setValues>[0]);
    },
    [setValues],
  );

  const reset = useCallback((): void => {
    // Clear every managed key. setValues(null) is nuqs's documented clear-all,
    // but the react-router v6 adapter no-ops on the bulk-null form; setting
    // each key to null individually clears reliably.
    const cleared = Object.fromEntries(Object.keys(PARSERS).map((k) => [k, null]));
    void setValues(cleared as Parameters<typeof setValues>[0]);
  }, [setValues]);

  // Sort, page, and pageSize shape the view but aren't user-facing filter
  // selections, so they don't count. q does — it narrows results.
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.q) n++;
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

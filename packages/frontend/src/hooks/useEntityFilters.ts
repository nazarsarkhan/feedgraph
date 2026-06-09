import { useCallback, useMemo } from 'react';
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs';
import type { EntityFilters, EntitySortBy, EntityType, SortOrder } from '@/lib/entities';

const TYPE_VALUES: EntityType[] = ['person', 'company', 'product', 'technology', 'location'];
const SORT_BY_VALUES: EntitySortBy[] = ['lastSeen', 'mentionCount', 'name'];
const ORDER_VALUES: SortOrder[] = ['asc', 'desc'];
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT_BY: EntitySortBy = 'lastSeen';
const DEFAULT_ORDER: SortOrder = 'desc';

/**
 * Entities list filters, URL as source of truth — backed by nuqs. Same
 * mechanics as useArticleFilters (nuqs serializes; the wrapper adds the
 * page-reset rule). `setFilters` (multi-key batch) backs the sortBy + order
 * control; nuqs would also compose two separate setFilter calls, but the
 * single-call form keeps the intent explicit.
 */
const PARSERS = {
  type: parseAsStringEnum<EntityType>(TYPE_VALUES),
  q: parseAsString,
  minMentions: parseAsInteger,
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
  sortBy: parseAsStringEnum<EntitySortBy>(SORT_BY_VALUES).withDefault(DEFAULT_SORT_BY),
  order: parseAsStringEnum<SortOrder>(ORDER_VALUES).withDefault(DEFAULT_ORDER),
};

export function useEntityFilters() {
  const [values, setValues] = useQueryStates(PARSERS);

  const filters = useMemo<EntityFilters>(
    () => ({
      type: values.type ?? undefined,
      q: values.q ?? undefined,
      // Guard against a non-positive minMentions in the URL.
      minMentions: values.minMentions && values.minMentions > 0 ? values.minMentions : undefined,
      page: values.page,
      pageSize: values.pageSize,
      sortBy: values.sortBy,
      order: values.order,
    }),
    [
      values.type,
      values.q,
      values.minMentions,
      values.page,
      values.pageSize,
      values.sortBy,
      values.order,
    ],
  );

  const setFilter = useCallback(
    <K extends keyof EntityFilters>(key: K, value: EntityFilters[K]): void => {
      const patch: Record<string, EntityFilters[keyof EntityFilters] | null> = {
        [key]: value === undefined || value === '' ? null : value,
      };
      if (key !== 'page') patch.page = null;
      void setValues(patch as Parameters<typeof setValues>[0]);
    },
    [setValues],
  );

  const setFilters = useCallback(
    (changes: Partial<EntityFilters>): void => {
      const patch: Record<string, EntityFilters[keyof EntityFilters] | null> = {};
      let touchedNonPage = false;
      for (const [k, v] of Object.entries(changes)) {
        patch[k] = v === undefined || v === '' ? null : v;
        if (k !== 'page') touchedNonPage = true;
      }
      if (touchedNonPage) patch.page = null;
      void setValues(patch as Parameters<typeof setValues>[0]);
    },
    [setValues],
  );

  const reset = useCallback((): void => {
    // Per-key null clear — the react-router v6 adapter no-ops on setValues(null).
    const cleared = Object.fromEntries(Object.keys(PARSERS).map((k) => [k, null]));
    void setValues(cleared as Parameters<typeof setValues>[0]);
  }, [setValues]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.type) n++;
    if (filters.q) n++;
    if (filters.minMentions) n++;
    return n;
  }, [filters]);

  return { filters, setFilter, setFilters, reset, activeFilterCount };
}

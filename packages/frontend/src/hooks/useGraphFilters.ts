import { useCallback, useMemo } from 'react';
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from 'nuqs';
import type { EntityType } from '@/lib/entities';
import type { GraphColorBy, GraphFilters } from '@/lib/graph';

const ENTITY_TYPES: EntityType[] = ['person', 'company', 'product', 'technology', 'location'];
const COLOR_BY_VALUES: GraphColorBy[] = ['type', 'category'];
const DEFAULT_COLOR_BY: GraphColorBy = 'type';

/**
 * Graph filters, URL as source of truth — backed by nuqs. The graph isn't
 * paginated, so there's no `page` field and no page-reset rule (unlike the
 * article/entity hooks). View toggles (`includeArticles`, `animate`) are only
 * ever set to `true` or cleared — the bar passes `undefined` to turn them off,
 * which nuqs drops from the URL, so a default-state graph has a clean URL.
 */
const PARSERS = {
  type: parseAsStringEnum<EntityType>(ENTITY_TYPES),
  minMentions: parseAsInteger,
  includeArticles: parseAsBoolean,
  colorBy: parseAsStringEnum<GraphColorBy>(COLOR_BY_VALUES).withDefault(DEFAULT_COLOR_BY),
  animate: parseAsBoolean,
  q: parseAsString,
  days: parseAsInteger,
};

export function useGraphFilters() {
  const [values, setValues] = useQueryStates(PARSERS);

  const filters = useMemo<GraphFilters>(
    () => ({
      type: values.type ?? undefined,
      minMentions: values.minMentions && values.minMentions > 0 ? values.minMentions : undefined,
      // Display toggles read as `true` when on, `undefined` when absent —
      // never `false` — matching the previous parse contract.
      includeArticles: values.includeArticles ? true : undefined,
      colorBy: values.colorBy,
      animate: values.animate ? true : undefined,
      q: values.q ?? undefined,
      days: values.days && values.days > 0 ? values.days : undefined,
    }),
    [
      values.type,
      values.minMentions,
      values.includeArticles,
      values.colorBy,
      values.animate,
      values.q,
      values.days,
    ],
  );

  const setFilter = useCallback(
    <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]): void => {
      // null clears the param. No page-reset — the graph has no pagination.
      const patch: Record<string, GraphFilters[keyof GraphFilters] | null> = {
        [key]: value === undefined || value === '' ? null : value,
      };
      void setValues(patch as Parameters<typeof setValues>[0]);
    },
    [setValues],
  );

  const reset = useCallback((): void => {
    // Per-key null clear — the react-router v6 adapter no-ops on setValues(null).
    const cleared = Object.fromEntries(Object.keys(PARSERS).map((k) => [k, null]));
    void setValues(cleared as Parameters<typeof setValues>[0]);
  }, [setValues]);

  // colorBy / includeArticles / animate are display modes, not narrowing
  // filters, so they don't count toward the active-filter badge.
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.type) n++;
    if (filters.minMentions) n++;
    if (filters.q) n++;
    if (filters.days) n++;
    return n;
  }, [filters]);

  return { filters, setFilter, reset, activeFilterCount };
}

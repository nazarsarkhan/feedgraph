import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EntityFilters, EntitySortBy, EntityType, SortOrder } from '@/lib/entities';

/**
 * URL state for the entities list. Mirrors useArticleFilters structure;
 * if a third similar hook appears, extract useUrlListFilters<TFilters>().
 *
 * - URL is the single source of truth; component tree reads `filters`.
 * - `setFilter` reflects the change in the URL and resets `page` on any
 *   non-page filter change (standard list UX).
 * - `setSearchParams` uses { replace: true } so history isn't flooded with
 *   each keystroke / dropdown click; bookmark / share still works.
 */

const TYPE_VALUES = ['person', 'company', 'product', 'technology', 'location'] as const;
const SORT_BY_VALUES = ['lastSeen', 'mentionCount', 'name'] as const;
const ORDER_VALUES = ['asc', 'desc'] as const;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT_BY: EntitySortBy = 'lastSeen';
const DEFAULT_ORDER: SortOrder = 'desc';

function pickEnum<T extends readonly string[]>(
  value: string | null,
  allowed: T,
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

export function useEntityFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: EntityFilters = useMemo(() => {
    const minMentionsRaw = Number(searchParams.get('minMentions'));
    return {
      type: pickEnum<typeof TYPE_VALUES>(searchParams.get('type'), TYPE_VALUES) as
        | EntityType
        | undefined,
      q: searchParams.get('q') ?? undefined,
      minMentions:
        Number.isFinite(minMentionsRaw) && minMentionsRaw > 0 ? minMentionsRaw : undefined,
      page: Number(searchParams.get('page')) || 1,
      pageSize: Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE,
      sortBy:
        (pickEnum<typeof SORT_BY_VALUES>(searchParams.get('sortBy'), SORT_BY_VALUES) as
          | EntitySortBy
          | undefined) ?? DEFAULT_SORT_BY,
      order:
        (pickEnum<typeof ORDER_VALUES>(searchParams.get('order'), ORDER_VALUES) as
          | SortOrder
          | undefined) ?? DEFAULT_ORDER,
    };
  }, [searchParams]);

  const setFilter = useCallback(
    <K extends keyof EntityFilters>(key: K, value: EntityFilters[K]): void => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === undefined || value === null || value === '') {
            next.delete(key as string);
          } else {
            next.set(key as string, String(value));
          }
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

  // Multi-key batch setter. setFilter calls don't compose when made in the
  // same synchronous block — React Router's setSearchParams isn't React-
  // state-queueable, so two back-to-back setFilter calls each see the URL
  // as it was BEFORE the first call, and the second clobbers the first.
  // Use this when changing more than one key at once (e.g. sortBy+order).
  const setFilters = useCallback(
    (changes: Partial<EntityFilters>): void => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          let touchedNonPage = false;
          for (const [k, v] of Object.entries(changes) as [keyof EntityFilters, unknown][]) {
            if (v === undefined || v === null || v === '') {
              next.delete(k as string);
            } else {
              next.set(k as string, String(v));
            }
            if (k !== 'page') touchedNonPage = true;
          }
          if (touchedNonPage) next.delete('page');
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

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.type) n++;
    if (filters.q) n++;
    if (filters.minMentions) n++;
    return n;
  }, [filters]);

  return { filters, setFilter, setFilters, reset, activeFilterCount };
}

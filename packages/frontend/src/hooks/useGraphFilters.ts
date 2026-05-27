import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EntityType } from '@/lib/entities';
import type { GraphFilters } from '@/lib/graph';

/**
 * URL state for the graph filters. Mirrors useEntityFilters / useArticleFilters
 * structurally; if a third filter-driven page surfaces beyond Articles /
 * Entities / Graph we should extract a generic useUrlListFilters<TFilters>().
 * The pattern: URL is the source of truth, setFilter is { replace: true }
 * so history isn't flooded with each keystroke, reset wipes everything.
 */

const ENTITY_TYPES = ['person', 'company', 'product', 'technology', 'location'] as const;

function pickEnum<T extends readonly string[]>(
  value: string | null,
  allowed: T,
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

export function useGraphFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: GraphFilters = useMemo(() => {
    const minRaw = Number(searchParams.get('minMentions'));
    return {
      type: pickEnum<typeof ENTITY_TYPES>(searchParams.get('type'), ENTITY_TYPES) as
        | EntityType
        | undefined,
      minMentions: Number.isFinite(minRaw) && minRaw > 0 ? minRaw : undefined,
    };
  }, [searchParams]);

  const setFilter = useCallback(
    <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]): void => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === undefined || value === null) {
            next.delete(key as string);
          } else {
            next.set(key as string, String(value));
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

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.type) n++;
    if (filters.minMentions) n++;
    return n;
  }, [filters]);

  return { filters, setFilter, reset, activeFilterCount };
}

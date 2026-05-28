import { useMemo } from 'react';
import type { EntityFilters, EntitySortBy, SortOrder } from '@/lib/entities';
import { pickEnum, useUrlFilters } from './useUrlFilters';

const TYPE_VALUES = ['person', 'company', 'product', 'technology', 'location'] as const;
const SORT_BY_VALUES = ['lastSeen', 'mentionCount', 'name'] as const;
const ORDER_VALUES = ['asc', 'desc'] as const;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT_BY: EntitySortBy = 'lastSeen';
const DEFAULT_ORDER: SortOrder = 'desc';

/**
 * Thin wrapper around `useUrlFilters<EntityFilters>`. `setFilters`
 * (multi-key batch setter) comes for free from the generic — the
 * sortBy + order pair on the entities list relies on it. See
 * useUrlFilters for the shared mechanics.
 */
export function useEntityFilters() {
  const options = useMemo(
    () => ({
      parse: (params: URLSearchParams): EntityFilters => {
        const minMentionsRaw = Number(params.get('minMentions'));
        return {
          type: pickEnum(params.get('type'), TYPE_VALUES),
          q: params.get('q') ?? undefined,
          minMentions:
            Number.isFinite(minMentionsRaw) && minMentionsRaw > 0 ? minMentionsRaw : undefined,
          page: Number(params.get('page')) || 1,
          pageSize: Number(params.get('pageSize')) || DEFAULT_PAGE_SIZE,
          sortBy: pickEnum(params.get('sortBy'), SORT_BY_VALUES) ?? DEFAULT_SORT_BY,
          order: pickEnum(params.get('order'), ORDER_VALUES) ?? DEFAULT_ORDER,
        };
      },
      countActive: (f: EntityFilters): number => {
        let n = 0;
        if (f.type) n++;
        if (f.q) n++;
        if (f.minMentions) n++;
        return n;
      },
    }),
    [],
  );

  return useUrlFilters<EntityFilters>(options);
}

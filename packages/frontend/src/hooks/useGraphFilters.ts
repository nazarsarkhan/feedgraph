import { useMemo } from 'react';
import type { GraphFilters } from '@/lib/graph';
import { pickEnum, useUrlFilters } from './useUrlFilters';

const ENTITY_TYPES = ['person', 'company', 'product', 'technology', 'location'] as const;

/**
 * Thin wrapper around `useUrlFilters<GraphFilters>`. The graph isn't
 * paginated, so there's no `page` field in GraphFilters — the generic's
 * `next.delete('page')` reset behavior is a no-op for this hook (the
 * URL never has a `page` param to delete). See useUrlFilters for the
 * shared mechanics.
 */
export function useGraphFilters() {
  const options = useMemo(
    () => ({
      parse: (params: URLSearchParams): GraphFilters => {
        const minRaw = Number(params.get('minMentions'));
        return {
          type: pickEnum(params.get('type'), ENTITY_TYPES),
          minMentions: Number.isFinite(minRaw) && minRaw > 0 ? minRaw : undefined,
          // `includeArticles` is a view toggle, not a filter — undefined
          // (key absent from URL) reads as off; only the literal string
          // 'true' enables articles. We don't count it in
          // activeFilterCount below because it's a display mode, not a
          // narrowing filter.
          includeArticles: params.get('includeArticles') === 'true' ? true : undefined,
        };
      },
      countActive: (f: GraphFilters): number => {
        let n = 0;
        if (f.type) n++;
        if (f.minMentions) n++;
        return n;
      },
    }),
    [],
  );

  return useUrlFilters<GraphFilters>(options);
}

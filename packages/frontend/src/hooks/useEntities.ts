import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { entitiesApi, type EntityFilters, type EntityListResponse } from '@/lib/entities';

export function useEntities(filters: EntityFilters) {
  return useQuery<EntityListResponse, ApiException>({
    queryKey: ['entities', filters],
    queryFn: () => entitiesApi.list(filters),
    // keepPreviousData smooths filter/pagination transitions — the previous
    // page stays visible while the new query resolves. Same trick as
    // useArticles; consolidate if a third list grows the pattern.
    placeholderData: keepPreviousData,
  });
}

import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { entitiesApi, type EntityDetail } from '@/lib/entities';

export function useEntity(id: string | undefined) {
  return useQuery<EntityDetail, ApiException>({
    queryKey: ['entity', id],
    queryFn: () => entitiesApi.detail(id!),
    enabled: !!id,
    retry: (failureCount, error) => {
      // 404 is terminal — the entity page will render a not-found view.
      if (error instanceof ApiException && error.status === 404) return false;
      return failureCount < 3;
    },
  });
}

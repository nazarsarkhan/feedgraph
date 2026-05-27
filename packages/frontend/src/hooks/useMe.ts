import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { authApi, type MeResponse } from '@/lib/auth';

export function useMe() {
  return useQuery<MeResponse | null, ApiException>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        // 401 is "not logged in", a valid resting state — return null
        // rather than throwing so consumers can switch on it cleanly.
        if (err instanceof ApiException && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
  });
}

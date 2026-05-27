import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { axesApi, type Axis } from '@/lib/axes';

export function useAxes() {
  return useQuery<Axis[], ApiException>({
    queryKey: ['axes'],
    queryFn: axesApi.list,
  });
}

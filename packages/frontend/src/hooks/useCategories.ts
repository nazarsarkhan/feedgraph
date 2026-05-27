import { useQuery } from '@tanstack/react-query';
import { ApiException } from '@/lib/api';
import { categoriesApi, type Category } from '@/lib/categories';

export function useCategories() {
  return useQuery<Category[], ApiException>({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  });
}

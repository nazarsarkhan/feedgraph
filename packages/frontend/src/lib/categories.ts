import { api } from './api';

export interface Category {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const categoriesApi = {
  list: (): Promise<Category[]> => api.get<Category[]>('/categories'),
  create: (body: { name: string }): Promise<Category> => api.post<Category>('/categories', body),
  remove: (id: string): Promise<void> => api.delete<void>(`/categories/${id}`),
};

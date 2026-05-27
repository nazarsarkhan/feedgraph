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
};

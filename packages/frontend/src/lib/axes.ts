import { api } from './api';

export interface AxisValue {
  id: string;
  value: string;
}

export interface Axis {
  id: string;
  name: string;
  description: string | null;
  values: AxisValue[];
}

export const axesApi = {
  list: (): Promise<Axis[]> => api.get<Axis[]>('/axes'),
  create: (body: { name: string; values: string[] }): Promise<Axis> =>
    api.post<Axis>('/axes', body),
  rename: (id: string, body: { name: string }): Promise<Axis> =>
    api.patch<Axis>(`/axes/${id}`, body),
  remove: (id: string): Promise<void> => api.delete<void>(`/axes/${id}`),
  addValue: (axisId: string, body: { value: string }): Promise<AxisValue> =>
    api.post<AxisValue>(`/axes/${axisId}/values`, body),
  renameValue: (axisId: string, valueId: string, body: { value: string }): Promise<AxisValue> =>
    api.patch<AxisValue>(`/axes/${axisId}/values/${valueId}`, body),
  removeValue: (axisId: string, valueId: string): Promise<void> =>
    api.delete<void>(`/axes/${axisId}/values/${valueId}`),
};

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
  addValue: (axisId: string, body: { value: string }): Promise<AxisValue> =>
    api.post<AxisValue>(`/axes/${axisId}/values`, body),
  removeValue: (axisId: string, valueId: string): Promise<void> =>
    api.delete<void>(`/axes/${axisId}/values/${valueId}`),
};

import { api } from './api';

export interface MeResponse {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

export interface DevModeFields {
  devMode?: { confirmationUrl: string; label: string };
}

export interface RegisterResponse extends DevModeFields {
  userId: string;
  message: string;
}

export interface LoginResponse {
  user: MeResponse;
}

export const authApi = {
  me: (): Promise<MeResponse> => api.get<MeResponse>('/auth/me'),
  register: (body: { email: string; password: string }): Promise<RegisterResponse> =>
    api.post<RegisterResponse>('/auth/register', body),
  login: (body: { email: string; password: string }): Promise<LoginResponse> =>
    api.post<LoginResponse>('/auth/login', body),
  logout: (): Promise<{ message: string }> => api.post<{ message: string }>('/auth/logout'),
  confirm: (token: string): Promise<{ message: string }> =>
    api.get<{ message: string }>(`/auth/confirm?token=${encodeURIComponent(token)}`),
  resendConfirmation: (body: { email: string }): Promise<RegisterResponse> =>
    api.post<RegisterResponse>('/auth/resend-confirmation', body),
};

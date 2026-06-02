import type { QueryClient } from '@tanstack/react-query';

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export class ApiException extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError,
  ) {
    super(typeof body.message === 'string' ? body.message : body.message.join('; '));
    this.name = 'ApiException';
  }
}

// QueryClient is registered from main.tsx after construction. We can't
// import it directly here because the client lives in the React tree's
// closure scope and importing it would create a circular module dep
// (api.ts → query-client → providers → components → api.ts). The setter
// pattern keeps api.ts dependency-free and the wiring explicit.
let queryClient: QueryClient | null = null;

export function setQueryClient(client: QueryClient): void {
  queryClient = client;
}

// Paths whose 401 is a user-facing error ("wrong password") rather than a
// session-expiry signal. Hitting these MUST NOT invalidate ['me'] — the
// caller already isn't logged in, and the form needs to show its own error.
const NON_SESSION_AUTH_PATHS = ['/auth/login', '/auth/register'];

// Methods the backend's CsrfGuard treats as state-changing. For these we
// echo the readable `csrf_token` cookie back in the X-CSRF-Token header
// (double-submit pattern). GET requests are exempt and need no header.
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let err: ApiError;
    try {
      err = (await res.json()) as ApiError;
    } catch {
      err = { statusCode: res.status, message: res.statusText };
    }

    // Global 401 handling: anything but the login/register endpoints means
    // our session is gone. Invalidate ['me'] so ProtectedRoute picks it up
    // on next render and redirects to /login. The login form catches its
    // own 401 via the thrown ApiException below.
    if (
      res.status === 401 &&
      queryClient &&
      !NON_SESSION_AUTH_PATHS.some((p) => path.startsWith(p))
    ) {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }

    throw new ApiException(res.status, err);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body),
  delete: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};

// Cookie names shared between AuthController (which sets them) and the
// CsrfGuard / JwtStrategy (which read them). Kept in one place so the
// HttpOnly access token and the readable CSRF token never drift apart.
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const CSRF_TOKEN_COOKIE = 'csrf_token';

// Header the double-submit pattern expects on mutating requests. The
// frontend reads CSRF_TOKEN_COOKIE (non-HttpOnly) and echoes it here.
export const CSRF_HEADER = 'x-csrf-token';

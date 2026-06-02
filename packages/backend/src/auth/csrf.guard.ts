import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE, CSRF_HEADER, CSRF_TOKEN_COOKIE } from './cookie.constants';

// Methods that don't mutate server state are exempt — a cross-site GET can't
// be weaponised by the double-submit threat model (and SSE/EventSource only
// ever issue GETs, so the future event stream is covered here too).
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF guard.
 *
 * On login we set two cookies: the HttpOnly `access_token` (the actual
 * session) and a readable `csrf_token`. A browser auto-sends both on every
 * request, but only first-party JS can read `csrf_token` and echo it in the
 * `X-CSRF-Token` header — a cross-origin attacker cannot. So for any mutating
 * request that carries a session cookie we require header === cookie.
 *
 * Requests without an `access_token` cookie are unauthenticated; JwtAuthGuard
 * rejects them downstream, so they need no CSRF check here. That naturally
 * exempts the session-establishing endpoints (login / register / confirm),
 * which can't carry a token the client hasn't been issued yet.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(req.method)) {
      return true;
    }

    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const sessionCookie = cookies[ACCESS_TOKEN_COOKIE];
    // No session → nothing to protect; the auth guards handle rejection.
    if (!sessionCookie) {
      return true;
    }

    const cookieToken = cookies[CSRF_TOKEN_COOKIE];
    const headerValue = req.headers[CSRF_HEADER];
    const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    return true;
  }
}

// Constant-time comparison so a mismatch doesn't leak token bytes via timing.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

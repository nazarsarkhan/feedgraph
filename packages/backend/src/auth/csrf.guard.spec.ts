import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE } from './cookie.constants';
import { CsrfGuard } from './csrf.guard';

interface FakeRequest {
  method: string;
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}

function ctx(req: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  let guard: CsrfGuard;

  beforeEach(() => {
    guard = new CsrfGuard();
  });

  describe('safe methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      it(`allows ${method} without any token`, () => {
        expect(guard.canActivate(ctx({ method }))).toBe(true);
      });
    }
  });

  describe('unauthenticated mutating requests', () => {
    it('allows a POST with no session cookie (login/register path)', () => {
      // No access_token cookie → JwtAuthGuard rejects downstream; nothing to
      // protect here, so CSRF lets it through.
      expect(guard.canActivate(ctx({ method: 'POST', cookies: {} }))).toBe(true);
    });
  });

  describe('authenticated mutating requests', () => {
    const session = { [ACCESS_TOKEN_COOKIE]: 'jwt' };

    it('allows when header matches the csrf cookie', () => {
      const req: FakeRequest = {
        method: 'POST',
        cookies: { ...session, [CSRF_TOKEN_COOKIE]: 'tok123' },
        headers: { 'x-csrf-token': 'tok123' },
      };
      expect(guard.canActivate(ctx(req))).toBe(true);
    });

    it('rejects when the header is missing', () => {
      const req: FakeRequest = {
        method: 'POST',
        cookies: { ...session, [CSRF_TOKEN_COOKIE]: 'tok123' },
        headers: {},
      };
      expect(() => guard.canActivate(ctx(req))).toThrow(ForbiddenException);
    });

    it('rejects when the header does not match the cookie', () => {
      const req: FakeRequest = {
        method: 'POST',
        cookies: { ...session, [CSRF_TOKEN_COOKIE]: 'tok123' },
        headers: { 'x-csrf-token': 'wrong' },
      };
      expect(() => guard.canActivate(ctx(req))).toThrow(ForbiddenException);
    });

    it('rejects when the csrf cookie is absent', () => {
      const req: FakeRequest = {
        method: 'DELETE',
        cookies: { ...session },
        headers: { 'x-csrf-token': 'tok123' },
      };
      expect(() => guard.canActivate(ctx(req))).toThrow(ForbiddenException);
    });
  });
});

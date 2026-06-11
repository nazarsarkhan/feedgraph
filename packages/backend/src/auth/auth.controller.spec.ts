import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.schema';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { AuthenticatedUser } from './types';

// GET /auth/me is the SPA's session bootstrap. It also carries the Bull Board
// "Open queues" link, which is an admin-only, env-gated affordance — these
// tests pin that gating so a regression can't leak the queue URL to a
// non-admin or surface a link when no URL is configured.
describe('AuthController.me', () => {
  function makeController(bullBoardUrl: string | undefined): AuthController {
    const config = {
      get: jest.fn().mockReturnValue(bullBoardUrl),
    } as unknown as ConfigService<Env, true>;
    // authService is unused by me(); a bare object is enough for this unit.
    return new AuthController({} as AuthService, config);
  }

  function reqFor(user: AuthenticatedUser): Request & { user: AuthenticatedUser } {
    return { user } as Request & { user: AuthenticatedUser };
  }

  const admin: AuthenticatedUser = { id: 'a1', email: 'admin@x.local', role: 'admin' };
  const user: AuthenticatedUser = { id: 'u1', email: 'demo@x.local', role: 'user' };

  it('returns bullBoardUrl for an admin when BULL_BOARD_URL is set', () => {
    const controller = makeController('http://localhost:3030');
    expect(controller.me(reqFor(admin))).toEqual({
      ...admin,
      bullBoardUrl: 'http://localhost:3030',
    });
  });

  it('omits bullBoardUrl for a non-admin even when BULL_BOARD_URL is set', () => {
    const controller = makeController('http://localhost:3030');
    const result = controller.me(reqFor(user));
    expect(result).toEqual(user);
    expect(result.bullBoardUrl).toBeUndefined();
  });

  it('omits bullBoardUrl for an admin when BULL_BOARD_URL is unset', () => {
    const controller = makeController(undefined);
    const result = controller.me(reqFor(admin));
    expect(result).toEqual(admin);
    expect(result.bullBoardUrl).toBeUndefined();
  });
});

import type { UserRole } from '../users/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  // Resolved per-request from the user row (not carried in the JWT) so a role
  // change takes effect on the next request without re-issuing the token.
  role: UserRole;
}

// Shape returned by GET /auth/me: the authenticated identity plus, for admins
// only, the Bull Board URL (when BULL_BOARD_URL is configured). The SPA reads
// this off its existing session bootstrap to render the "Open queues" link —
// no separate config endpoint, and non-admins never receive the URL.
export interface MeResponse extends AuthenticatedUser {
  bullBoardUrl?: string;
}

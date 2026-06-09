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

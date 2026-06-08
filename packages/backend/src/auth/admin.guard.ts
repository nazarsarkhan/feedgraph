import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './types';

// Runs AFTER JwtAuthGuard, which populates req.user (role included, resolved
// from the user row by JwtStrategy.validate). Gates admin-only endpoints such
// as the cross-user telemetry summary. A non-admin gets 403 — the resource is
// known to exist, the caller simply lacks the role (unlike the 404 we return
// for cross-tenant access, which hides existence).
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}

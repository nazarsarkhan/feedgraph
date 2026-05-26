import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './types';

// Runs AFTER JwtAuthGuard. Defense-in-depth: AuthService.login already
// rejects unconfirmed users so they never get a token, but this guard
// makes the constraint explicit for any future endpoint that mounts it.
@Injectable()
export class EmailConfirmedGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!req.user) {
      throw new ForbiddenException();
    }
    const user = await this.users.findById(req.user.id);
    if (!user || !user.emailConfirmedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Email not confirmed',
        error: 'EMAIL_NOT_CONFIRMED',
      });
    }
    return true;
  }
}

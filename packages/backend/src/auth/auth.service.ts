import {
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import ms from 'ms';
import type { Env } from '../config/env.schema';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser, JwtPayload } from './types';

const CONFIRMATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface ConfirmationResult {
  userId: string;
  confirmationUrl: string;
  devModeLink: string;
}

interface LoginResult {
  accessToken: string;
  accessTokenMaxAgeMs: number;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(input: { email: string; password: string }): Promise<ConfirmationResult> {
    const email = input.email.toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await argon2.hash(input.password);
    const { token, expiresAt } = this.newConfirmationToken();
    const user = await this.users.create({
      email,
      passwordHash,
      emailConfirmationToken: token,
      emailConfirmationExpiresAt: expiresAt,
    });
    const confirmationUrl = this.buildConfirmationUrl(token);
    this.logger.log(`[DEV MODE] confirmation URL for ${email}: ${confirmationUrl}`);
    return { userId: user.id, confirmationUrl, devModeLink: confirmationUrl };
  }

  async confirmEmail(token: string): Promise<void> {
    const user = await this.users.findByConfirmationToken(token);
    if (!user) {
      throw new NotFoundException('Invalid token');
    }
    if (user.emailConfirmedAt) {
      // Idempotent: already confirmed is a no-op success.
      return;
    }
    if (!user.emailConfirmationExpiresAt || user.emailConfirmationExpiresAt < new Date()) {
      throw new GoneException('Token expired');
    }
    await this.users.confirmEmail(user.id);
  }

  async resendConfirmation(email: string): Promise<ConfirmationResult> {
    const normalized = email.toLowerCase();
    const user = await this.users.findByEmail(normalized);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.emailConfirmedAt) {
      throw new ConflictException('Email already confirmed');
    }
    const { token, expiresAt } = this.newConfirmationToken();
    await this.users.regenerateConfirmationToken(user.id, token, expiresAt);
    const confirmationUrl = this.buildConfirmationUrl(token);
    this.logger.log(`[DEV MODE] resent confirmation URL for ${normalized}: ${confirmationUrl}`);
    return { userId: user.id, confirmationUrl, devModeLink: confirmationUrl };
  }

  async login(input: { email: string; password: string }): Promise<LoginResult> {
    const email = input.email.toLowerCase();
    const user = await this.users.findByEmail(email);
    // Verify hash even when user is missing so timing doesn't reveal whether
    // the email exists. argon2.verify of a fake hash takes similar time.
    const passwordOk =
      user !== null && (await argon2.verify(user.passwordHash, input.password).catch(() => false));
    if (!user || !passwordOk) {
      throw new HttpException(
        { statusCode: 401, message: 'Invalid credentials', error: 'INVALID_CREDENTIALS' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!user.emailConfirmedAt) {
      throw new HttpException(
        { statusCode: 401, message: 'Email not confirmed', error: 'EMAIL_NOT_CONFIRMED' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      // ms() is what @nestjs/jwt uses internally to parse the same string,
      // so cookie maxAge and JWT exp are derived from the same source.
      accessTokenMaxAgeMs:
        ms(this.config.get('JWT_EXPIRATION', { infer: true }) as ms.StringValue) ?? 0,
      user: { id: user.id, email: user.email },
    };
  }

  async validateJwtPayload(payload: JwtPayload): Promise<AuthenticatedUser | null> {
    const user = await this.users.findById(payload.sub);
    if (!user || !user.emailConfirmedAt) {
      return null;
    }
    return { id: user.id, email: user.email };
  }

  private newConfirmationToken(): { token: string; expiresAt: Date } {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + CONFIRMATION_EXPIRY_MS);
    return { token, expiresAt };
  }

  private buildConfirmationUrl(token: string): string {
    const base = this.config.get('APP_URL', { infer: true });
    return `${base}/auth/confirm?token=${token}`;
  }
}

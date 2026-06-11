import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import type { Env } from '../config/env.schema';
import { AuthService } from './auth.service';
import { ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE } from './cookie.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser, MeResponse } from './types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<unknown> {
    const result = await this.authService.register(dto);
    return {
      userId: result.userId,
      message: 'Confirmation email sent',
      ...this.devModeFields(result.confirmationUrl),
    };
  }

  @Get('confirm')
  async confirm(@Query('token') token: string): Promise<{ message: string }> {
    await this.authService.confirmEmail(token);
    return { message: 'Email confirmed' };
  }

  @Post('resend-confirmation')
  @HttpCode(HttpStatus.OK)
  async resend(@Body() dto: ResendConfirmationDto): Promise<unknown> {
    const result = await this.authService.resendConfirmation(dto.email);
    return {
      userId: result.userId,
      message: 'Confirmation email sent',
      ...this.devModeFields(result.confirmationUrl),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const { accessToken, accessTokenMaxAgeMs, user } = await this.authService.login(dto);
    const secure = this.config.get('NODE_ENV', { infer: true }) === 'production';
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      // Secure requires HTTPS; localhost has none in dev, so gate on NODE_ENV.
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: accessTokenMaxAgeMs,
    });
    // Double-submit CSRF token. Deliberately NOT HttpOnly: first-party JS
    // reads it and echoes it in the X-CSRF-Token header on mutating requests
    // (see CsrfGuard). Same maxAge as the session so the two never drift.
    res.cookie(CSRF_TOKEN_COOKIE, randomBytes(32).toString('hex'), {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: accessTokenMaxAgeMs,
    });
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response): { message: string } {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    res.clearCookie(CSRF_TOKEN_COOKIE, { path: '/' });
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: AuthenticatedUser }): MeResponse {
    const bullBoardUrl = this.config.get('BULL_BOARD_URL', { infer: true });
    // Queue monitoring is an admin affordance. Surface the link only to admins
    // and only when an URL is configured — non-admins never receive it, so the
    // SPA has nothing to render for them.
    if (req.user.role === 'admin' && bullBoardUrl) {
      return { ...req.user, bullBoardUrl };
    }
    return req.user;
  }

  private devModeFields(confirmationUrl: string): Record<string, unknown> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      return {};
    }
    return { devMode: { confirmationUrl, label: 'DEV MODE' } };
  }
}

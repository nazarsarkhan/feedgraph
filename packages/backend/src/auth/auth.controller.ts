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
import type { Request, Response } from 'express';
import type { Env } from '../config/env.schema';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './types';

const ACCESS_TOKEN_COOKIE = 'access_token';

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
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      // Secure requires HTTPS; localhost has none in dev, so gate on NODE_ENV.
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
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
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: AuthenticatedUser }): AuthenticatedUser {
    return req.user;
  }

  private devModeFields(confirmationUrl: string): Record<string, unknown> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      return {};
    }
    return { devMode: { confirmationUrl, label: 'DEV MODE' } };
  }
}

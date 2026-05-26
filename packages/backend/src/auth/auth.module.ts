import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AxesModule } from '../axes/axes.module';
import type { Env } from '../config/env.schema';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailConfirmedGuard } from './email-confirmed.guard';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('JWT_EXPIRATION', { infer: true }) },
      }),
    }),
    // AxesService is called from AuthService.register to seed defaults
    // inside the same transaction; AxesModule also imports AuthModule for
    // the guards on AxesController, hence the forwardRef on both sides.
    forwardRef(() => AxesModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, EmailConfirmedGuard],
  exports: [AuthService, EmailConfirmedGuard],
})
export class AuthModule {}

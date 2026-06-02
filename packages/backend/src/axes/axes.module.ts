import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AxesController } from './axes.controller';
import { AxesService } from './axes.service';
import { Axis } from './axis.entity';
import { AxisValue } from './axis-value.entity';

@Module({
  // forwardRef around AuthModule: AuthService.register injects AxesService
  // for seeding defaults, creating a circular dep (AxesController also needs
  // AuthModule's guards). forwardRef is the canonical NestJS escape hatch.
  // AuthModule re-exports UsersModule for EmailConfirmedGuard's UsersService.
  imports: [TypeOrmModule.forFeature([Axis, AxisValue]), forwardRef(() => AuthModule)],
  controllers: [AxesController],
  providers: [AxesService],
  exports: [AxesService],
})
export class AxesModule {}

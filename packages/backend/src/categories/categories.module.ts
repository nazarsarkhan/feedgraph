import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from './category.entity';

@Module({
  // UsersModule imported for EmailConfirmedGuard's UsersService dependency
  // (tracked in PLAN.md tech debt: AuthModule should re-export it).
  imports: [TypeOrmModule.forFeature([Category]), AuthModule, UsersModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}

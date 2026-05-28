import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { Article } from './article.entity';
import { ArticlesController } from './articles.controller';
import { ArticlesListService } from './articles-list.service';
import { ArticlesService } from './articles.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Article]), AuthModule, UsersModule],
  // DashboardController is mounted alongside ArticlesController — it
  // doesn't need its own module because its only dep is the
  // DataSource (raw SQL). If it grows a service layer (memoization,
  // pre-aggregated views) it can move into its own DashboardModule.
  controllers: [ArticlesController, DashboardController],
  providers: [ArticlesService, ArticlesListService],
  exports: [ArticlesService],
})
export class ArticlesModule {}

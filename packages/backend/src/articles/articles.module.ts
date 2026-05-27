import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { Article } from './article.entity';
import { ArticlesController } from './articles.controller';
import { ArticlesListService } from './articles-list.service';
import { ArticlesService } from './articles.service';

@Module({
  imports: [TypeOrmModule.forFeature([Article]), AuthModule, UsersModule],
  controllers: [ArticlesController],
  providers: [ArticlesService, ArticlesListService],
  exports: [ArticlesService],
})
export class ArticlesModule {}

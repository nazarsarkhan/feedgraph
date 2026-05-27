import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AxesModule } from '../../axes/axes.module';
import { CategoriesModule } from '../../categories/categories.module';
import { GraphEntitiesModule } from '../../graph-entities/graph-entities.module';
import { LlmModule } from '../../llm/llm.module';
import { Article } from '../article.entity';
import { ArticleProcessProcessor } from './article-process.processor';
import { ArticleProcessService } from './article-process.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article]),
    LlmModule,
    GraphEntitiesModule,
    CategoriesModule,
    AxesModule,
  ],
  providers: [ArticleProcessService, ArticleProcessProcessor],
  exports: [ArticleProcessService],
})
export class ArticleProcessModule {}

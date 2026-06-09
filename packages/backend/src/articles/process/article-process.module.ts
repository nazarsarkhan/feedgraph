import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AxesModule } from '../../axes/axes.module';
import { CategoriesModule } from '../../categories/categories.module';
import { isWorkerMode } from '../../config/run-mode';
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
  // The processor only loads in worker/all mode (RUN_MODE split); the service
  // stays available for direct callers in the api process.
  providers: [ArticleProcessService, ...(isWorkerMode() ? [ArticleProcessProcessor] : [])],
  exports: [ArticleProcessService],
})
export class ArticleProcessModule {}

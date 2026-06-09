import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from '../articles/article.entity';
import { isWorkerMode } from '../config/run-mode';
import { PrefilterProcessor } from './prefilter.processor';
import { PrefilterService } from './prefilter.service';

@Module({
  // QueueModule is @Global() and registers ARTICLE_PREFILTER there, so the
  // BullMQ queue is visible without an explicit import. We only need direct
  // access to the Article repository here.
  imports: [TypeOrmModule.forFeature([Article])],
  // The processor only loads in worker/all mode (RUN_MODE split); the api
  // process keeps PrefilterService for any direct callers but consumes no jobs.
  providers: [PrefilterService, ...(isWorkerMode() ? [PrefilterProcessor] : [])],
  exports: [PrefilterService],
})
export class PrefilterModule {}

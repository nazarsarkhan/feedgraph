import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from '../articles/article.entity';
import { PrefilterProcessor } from './prefilter.processor';
import { PrefilterService } from './prefilter.service';

@Module({
  // QueueModule is @Global() and registers ARTICLE_PREFILTER there, so the
  // BullMQ queue is visible without an explicit import. We only need direct
  // access to the Article repository here.
  imports: [TypeOrmModule.forFeature([Article])],
  providers: [PrefilterService, PrefilterProcessor],
  exports: [PrefilterService],
})
export class PrefilterModule {}

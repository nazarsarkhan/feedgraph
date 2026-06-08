import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesModule } from '../articles/articles.module';
import { AuthModule } from '../auth/auth.module';
import { isApiMode, isWorkerMode } from '../config/run-mode';
import { FeedEventsService } from './feed-events.service';
import { FeedPollProcessor } from './feed-poll.processor';
import { FeedPollScheduler } from './feed-poll.scheduler';
import { FeedPollService } from './feed-poll.service';
import { FeedValidatorService } from './feed-validator.service';
import { FeedsController } from './feeds.controller';
import { FeedsService } from './feeds.service';
import { Feed } from './feed.entity';
import { UrlNormalizerService } from './url-normalizer.service';

@Module({
  // AuthModule re-exports UsersModule, so EmailConfirmedGuard (provided by
  // AuthModule but depending on UsersService) resolves at injection time.
  // QueueModule is @Global() so the BullMQ queue providers are visible here
  // without an explicit import.
  imports: [TypeOrmModule.forFeature([Feed]), AuthModule, ArticlesModule],
  controllers: [FeedsController],
  providers: [
    FeedsService,
    FeedValidatorService,
    UrlNormalizerService,
    FeedPollService,
    FeedEventsService,
    // RUN_MODE split: the BullMQ processor only loads where queue work runs
    // (worker/all) and the cron scheduler only where HTTP/cron runs (api/all),
    // so a separate worker process never double-consumes jobs or double-ticks
    // the poll cron. See config/run-mode.ts.
    ...(isWorkerMode() ? [FeedPollProcessor] : []),
    ...(isApiMode() ? [FeedPollScheduler] : []),
  ],
  exports: [FeedsService, UrlNormalizerService],
})
export class FeedsModule {}

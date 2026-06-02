import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesModule } from '../articles/articles.module';
import { AuthModule } from '../auth/auth.module';
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
    FeedPollProcessor,
    FeedPollScheduler,
  ],
  exports: [FeedsService, UrlNormalizerService],
})
export class FeedsModule {}

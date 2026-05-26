import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { QUEUE_NAMES } from './queue-names';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
          // maxRetriesPerRequest: null is required for bullmq workers that
          // block on BRPOPLPUSH indefinitely. Match the RedisService client.
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.FEED_POLL }),
    BullModule.registerQueue({ name: QUEUE_NAMES.ARTICLE_PREFILTER }),
  ],
  exports: [BullModule],
})
export class QueueModule {}

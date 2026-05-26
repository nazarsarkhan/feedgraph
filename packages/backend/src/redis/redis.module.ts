import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

// Global so BullMQ modules added later can inject this shared connection
// without each feature module re-importing RedisModule.
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

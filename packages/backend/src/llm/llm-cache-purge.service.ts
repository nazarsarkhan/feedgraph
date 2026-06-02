import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmCache } from './llm-cache.entity';

/**
 * Daily eviction of expired llm_cache rows. Rows with NULL expires_at never
 * expire (the default when LLM_CACHE_TTL_DAYS=0) and are never touched. The
 * DELETE is idempotent and uses the partial index llm_cache_expires_at_idx,
 * so running it in multiple processes (e.g. an api + worker split) is safe.
 */
@Injectable()
export class LlmCachePurgeService {
  private readonly logger = new Logger(LlmCachePurgeService.name);

  constructor(@InjectRepository(LlmCache) private readonly cache: Repository<LlmCache>) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<void> {
    const result = await this.cache
      .createQueryBuilder()
      .delete()
      .where('expires_at IS NOT NULL AND expires_at <= now()')
      .execute();
    if (result.affected) {
      this.logger.log(`purged ${result.affected} expired llm_cache row(s)`);
    }
  }
}

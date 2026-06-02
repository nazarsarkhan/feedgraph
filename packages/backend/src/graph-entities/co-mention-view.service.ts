import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Owns refreshes of the entity_co_mentions materialized view. Callers that
 * mutate article_entities (article-process, entity dedup, demo seed) fire
 * requestRefresh() so the view converges quickly; a cron safety net catches
 * anything missed. The view is read by GraphService (co_mention edges) and
 * EntitiesListService (related entities).
 */
@Injectable()
export class CoMentionViewService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CoMentionViewService.name);

  // Single-flight + coalescing: only one REFRESH runs at a time; concurrent
  // requests set `pending` and the in-flight loop refreshes once more, so a
  // burst of writes collapses into at most one extra refresh.
  private refreshing = false;
  private pending = false;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    // Reflect any article_entities changes that happened while this process
    // was down (another instance's writes, a bulk import). Fire-and-forget.
    void this.requestRefresh();
  }

  /**
   * Coalescing, single-flight CONCURRENTLY refresh. Never throws — errors are
   * logged so a refresh failure can't break the write path that triggered it.
   * CONCURRENTLY runs outside any transaction (dataSource.query autocommits)
   * and relies on the unique index entity_co_mentions_pair_uidx.
   */
  async requestRefresh(): Promise<void> {
    if (this.refreshing) {
      this.pending = true;
      return;
    }
    this.refreshing = true;
    try {
      do {
        this.pending = false;
        await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY "entity_co_mentions"');
      } while (this.pending);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`entity_co_mentions refresh failed: ${message}`);
    } finally {
      this.refreshing = false;
    }
  }

  // Safety net so the view converges even if a write-path refresh was missed.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledRefresh(): Promise<void> {
    await this.requestRefresh();
  }
}

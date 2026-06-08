import { createHash } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import Parser from 'rss-parser';
import { Repository } from 'typeorm';
import { ArticlesService, type RssItemInput } from '../articles/articles.service';
import type { Env } from '../config/env.schema';
import { QUEUE_NAMES } from '../queue/queue-names';
import { FeedEventsService } from './feed-events.service';
import { Feed } from './feed.entity';
import { UrlNormalizerService } from './url-normalizer.service';

export interface PollResult {
  inserted: number;
  skipped: number;
}

@Injectable()
export class FeedPollService {
  private readonly logger = new Logger(FeedPollService.name);

  constructor(
    @InjectRepository(Feed) private readonly feeds: Repository<Feed>,
    private readonly articles: ArticlesService,
    private readonly urlNormalizer: UrlNormalizerService,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(QUEUE_NAMES.ARTICLE_PREFILTER) private readonly prefilterQueue: Queue,
    private readonly events: FeedEventsService,
  ) {}

  /**
   * Polls a single feed by id. Runs system-wide (no userId filter) because
   * it's invoked from the worker, not from a user request. Multi-tenant
   * filtering happens in the manual-trigger controller before the job is
   * enqueued, and in the scheduler when it lists feeds to enqueue.
   */
  async pollOne(feedId: string): Promise<PollResult> {
    const feed = await this.feeds.findOne({ where: { id: feedId } });
    if (!feed) {
      this.logger.warn(`feed not found feed=${feedId}`);
      return { inserted: 0, skipped: 0 };
    }
    if (feed.status === 'paused') {
      this.logger.log(`feed paused, skipping feed=${feedId}`);
      return { inserted: 0, skipped: 0 };
    }

    const timeout = this.config.get('FEED_VALIDATION_TIMEOUT_MS', { infer: true });
    const parser = new Parser({ timeout });

    let parsed;
    try {
      parsed = await parser.parseURL(feed.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown parser error';
      // Persist the error state so the UI can show it; then re-throw so
      // BullMQ records the job as failed and applies its retry policy.
      feed.status = 'error';
      feed.lastErrorMessage = message;
      feed.lastPolledAt = new Date();
      await this.feeds.save(feed);
      // Notify any SSE listener before re-throwing so the UI reflects the
      // failure immediately. Publish failures must not mask the poll error.
      await this.events
        .publish({ feedId, userId: feed.userId, status: 'error', error: message })
        .catch(() => undefined);
      throw new Error(`feed parse failed feed=${feedId}: ${message}`, { cause: err });
    }

    let inserted = 0;
    let skipped = 0;
    for (const item of parsed.items) {
      if (!item.link) continue;
      let urlNormalized: string;
      try {
        urlNormalized = this.urlNormalizer.normalize(item.link);
      } catch {
        // Unparseable URL on an item is not a feed-level failure; skip and continue.
        this.logger.warn(`unparseable item url feed=${feedId} url=${item.link}`);
        continue;
      }
      const text = `${item.title ?? ''}||${item.content ?? item.contentSnippet ?? ''}`;
      const contentHash = createHash('sha256').update(text).digest('hex');
      const result = await this.articles.upsertFromRssItem(
        feed.userId,
        feed.id,
        item as RssItemInput,
        urlNormalized,
        contentHash,
      );
      if (result.inserted) {
        inserted++;
        // Only newly inserted articles get prefiltered. Skipped duplicates
        // were prefiltered when first inserted; re-running would either be
        // a no-op or overwrite an LLM-derived later status.
        await this.prefilterQueue.add(
          'prefilter',
          { articleId: result.articleId },
          { attempts: 2, backoff: { type: 'exponential', delay: 5_000 } },
        );
      } else {
        skipped++;
      }
    }

    feed.status = 'active';
    feed.lastErrorMessage = null;
    feed.lastPolledAt = new Date();
    await this.feeds.save(feed);

    this.logger.log(
      `polled feed=${feedId} user=${feed.userId} inserted=${inserted} skipped=${skipped}`,
    );
    await this.events
      .publish({ feedId, userId: feed.userId, status: 'polled', inserted, skipped })
      .catch(() => undefined);
    return { inserted, skipped };
  }
}

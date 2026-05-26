import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { CronJob } from 'cron';
import { Repository } from 'typeorm';
import type { Env } from '../config/env.schema';
import { QUEUE_NAMES } from '../queue/queue-names';
import { Feed } from './feed.entity';

const CRON_NAME = 'feed-poll-tick';

@Injectable()
export class FeedPollScheduler implements OnModuleInit {
  private readonly logger = new Logger(FeedPollScheduler.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
    @InjectRepository(Feed) private readonly feeds: Repository<Feed>,
    @InjectQueue(QUEUE_NAMES.FEED_POLL) private readonly queue: Queue,
  ) {}

  onModuleInit(): void {
    const minutes = this.config.get('FEED_POLL_INTERVAL_MINUTES', { infer: true });
    // Dynamic registration (vs static @Cron) because the interval is env-driven.
    const job = new CronJob(`*/${minutes} * * * *`, () => {
      void this.tick();
    });
    this.scheduler.addCronJob(CRON_NAME, job);
    job.start();
    this.logger.log(`feed-poll cron registered every ${minutes} minute(s)`);
  }

  async tick(): Promise<void> {
    const active = await this.feeds.find({
      where: { status: 'active' },
      select: { id: true },
    });
    for (const feed of active) {
      // Per-feed add (not addBulk) so each job is independently retryable
      // and a single bad add doesn't strand the whole tick.
      await this.queue.add(
        'poll',
        { feedId: feed.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
      );
    }
    this.logger.log(`tick enqueued ${active.length} feed-poll jobs`);
  }
}

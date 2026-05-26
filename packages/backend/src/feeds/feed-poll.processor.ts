import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue/queue-names';
import { FeedPollService } from './feed-poll.service';

// Concurrency is read from process.env at module-load time because @Processor
// decorator options are evaluated before NestJS DI / ConfigService boot.
// env.schema validates the variable at boot, so an invalid value still fails fast.
const concurrency = Number(process.env.FEED_POLL_WORKER_CONCURRENCY) || 5;

interface FeedPollJobData {
  feedId: string;
}

@Processor(QUEUE_NAMES.FEED_POLL, { concurrency })
export class FeedPollProcessor extends WorkerHost {
  private readonly logger = new Logger(FeedPollProcessor.name);

  constructor(private readonly feedPoll: FeedPollService) {
    super();
  }

  async process(job: Job<FeedPollJobData>): Promise<void> {
    const { feedId } = job.data;
    this.logger.log(`feed-poll job=${job.id} attempt=${job.attemptsMade + 1} feed=${feedId}`);
    try {
      const result = await this.feedPoll.pollOne(feedId);
      this.logger.log(
        `feed-poll done job=${job.id} feed=${feedId} inserted=${result.inserted} skipped=${result.skipped}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Log with stack and rethrow so BullMQ records the failure and applies retry.
      this.logger.error(
        `feed-poll failed job=${job.id} feed=${feedId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue/queue-names';
import { PrefilterService } from './prefilter.service';

// Concurrency is read from process.env at module-load time because @Processor
// decorator options are evaluated before NestJS DI / ConfigService boot.
// env.schema validates the variable at boot, so an invalid value still fails fast.
const concurrency = Number(process.env.PREFILTER_WORKER_CONCURRENCY) || 10;

interface PrefilterJobData {
  articleId: string;
}

@Processor(QUEUE_NAMES.ARTICLE_PREFILTER, { concurrency })
export class PrefilterProcessor extends WorkerHost {
  private readonly logger = new Logger(PrefilterProcessor.name);

  constructor(private readonly prefilter: PrefilterService) {
    super();
  }

  async process(job: Job<PrefilterJobData>): Promise<void> {
    const { articleId } = job.data;
    this.logger.log(`prefilter job=${job.id} attempt=${job.attemptsMade + 1} article=${articleId}`);
    try {
      const outcome = await this.prefilter.prefilter(articleId);
      this.logger.log(
        `prefilter done job=${job.id} article=${articleId} ` +
          `status=${outcome.status} reason=${outcome.reason ?? 'none'}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `prefilter failed job=${job.id} article=${articleId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }
}

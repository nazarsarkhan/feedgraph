import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/queue-names';
import { ArticleProcessService } from './article-process.service';

// Concurrency read at module-load — env.schema validates the value at boot.
// The LlmService semaphore further caps real LLM in-flight; this knob is
// the BullMQ-side parallelism for the queue itself.
const concurrency = Number(process.env.ARTICLE_PROCESS_WORKER_CONCURRENCY) || 3;

interface ArticleProcessJobData {
  articleId: string;
}

@Processor(QUEUE_NAMES.ARTICLE_PROCESS, { concurrency })
export class ArticleProcessProcessor extends WorkerHost {
  private readonly logger = new Logger(ArticleProcessProcessor.name);

  constructor(private readonly service: ArticleProcessService) {
    super();
  }

  async process(job: Job<ArticleProcessJobData>): Promise<void> {
    const { articleId } = job.data;
    this.logger.log(
      `article-process job=${job.id} attempt=${job.attemptsMade + 1} article=${articleId}`,
    );
    try {
      const outcome = await this.service.process(articleId);
      this.logger.log(
        `article-process done job=${job.id} article=${articleId} status=${outcome.status} entities=${outcome.entities} categories=${outcome.categories} axes=${outcome.axisValues}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `article-process failed job=${job.id} article=${articleId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }
}

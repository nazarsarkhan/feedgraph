import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue/queue-names';
import { Digest } from './digest.entity';
import { DigestsService, type DigestJobData } from './digests.service';

// Concurrency read at module-load — env.schema validates the value at boot.
// Default 1: generation is one LLM round-trip per job and single-flighted per
// (user, period) at enqueue time, so there's no need to fan out per worker.
const concurrency = Number(process.env.DIGEST_WORKER_CONCURRENCY) || 1;

@Processor(QUEUE_NAMES.DIGEST, { concurrency })
export class DigestProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(private readonly service: DigestsService) {
    super();
  }

  async process(job: Job<DigestJobData>): Promise<Digest> {
    const { userId, periodType, date } = job.data;
    this.logger.log(
      `digest job=${job.id} attempt=${job.attemptsMade + 1} user=${userId} period=${periodType}/${date}`,
    );
    try {
      const digest = await this.service.generate(userId, periodType, date);
      this.logger.log(
        `digest done job=${job.id} user=${userId} id=${digest.id} period=${digest.periodType}/${digest.periodStart} articles=${digest.articleCount}`,
      );
      return digest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `digest failed job=${job.id} user=${userId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }
}

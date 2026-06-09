import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queue/queue-names';
import { EntityDedupService, type DedupJobData, type DedupResult } from './entity-dedup.service';

// Concurrency read at module-load — env.schema validates the value at boot.
// Default 1: a dedup job mutates a user's whole entity set in a transaction.
const concurrency = Number(process.env.ENTITY_DEDUP_WORKER_CONCURRENCY) || 1;

@Processor(QUEUE_NAMES.ENTITY_DEDUP, { concurrency })
export class EntityDedupProcessor extends WorkerHost {
  private readonly logger = new Logger(EntityDedupProcessor.name);

  constructor(private readonly service: EntityDedupService) {
    super();
  }

  async process(job: Job<DedupJobData>): Promise<DedupResult> {
    const { userId } = job.data;
    this.logger.log(`entity-dedup job=${job.id} attempt=${job.attemptsMade + 1} user=${userId}`);
    try {
      // Forward each per-batch progress snapshot to the job so the frontend's
      // status poll can render a denominator + running totals.
      const result = await this.service.runForUser(userId, (progress) =>
        job.updateProgress(progress),
      );
      this.logger.log(
        `entity-dedup done job=${job.id} user=${userId} considered=${result.entitiesConsidered} batches=${result.batches} groups=${result.groupsFound} merged=${result.entitiesMerged}`,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `entity-dedup failed job=${job.id} user=${userId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }
}

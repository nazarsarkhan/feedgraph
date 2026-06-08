import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { isApiMode } from '../../config/run-mode';
import { DemoSeedService } from './demo-seed.service';

/**
 * Auto-seeds demo data on application bootstrap when SEED_DEMO_ON_BOOT is
 * true. Runs after migrations (main.ts runs migrations before
 * NestFactory.create completes; this hook fires during the next phase,
 * onApplicationBootstrap, which is the last hook before the HTTP server
 * starts listening). Failures are logged but never crash the app —
 * losing the demo data is preferable to losing the backend on startup.
 */
@Injectable()
export class DemoSeedBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeedBootstrap.name);

  constructor(
    private readonly seedService: DemoSeedService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Seeding is the api/all process's job — it owns migrations and runs once.
    // A pure worker would otherwise race it on the same idempotent insert.
    if (!isApiMode()) return;
    const enabled = this.config.get('SEED_DEMO_ON_BOOT', { infer: true });
    if (!enabled) return;

    try {
      await this.seedService.seed();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown seed error';
      this.logger.error(
        `demo seed failed (continuing boot): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}

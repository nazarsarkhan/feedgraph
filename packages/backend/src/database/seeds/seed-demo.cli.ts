import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { DemoSeedService } from './demo-seed.service';

/**
 * Standalone runner — `npm run seed:demo -w @feedgraph/backend` invokes
 * this. Bootstraps the full Nest IoC container WITHOUT an HTTP listener
 * (createApplicationContext, not create), pulls DemoSeedService out of
 * the container, runs seed(), then closes the context so lifecycle hooks
 * fire and the process exits cleanly.
 *
 * The boot path still runs migrations (main.ts logic isn't executed here
 * directly, but ConfigModule + TypeOrmModule.forRootAsync still init);
 * migrations are applied automatically when RUN_MIGRATIONS_ON_BOOT=true,
 * the same env knob that governs the HTTP-server boot.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const log = new Logger('SeedDemoCli');
  try {
    const seedService = app.get(DemoSeedService);
    const result = await seedService.seed();
    if (result.skipped) {
      log.log(`seed skipped (demo user already exists user=${result.userId})`);
    } else {
      log.log(`seed complete user=${result.userId}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error(`seed failed: ${message}`, err instanceof Error ? err.stack : undefined);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();

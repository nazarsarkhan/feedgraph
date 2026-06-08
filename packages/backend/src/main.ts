import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';
import { getRunMode } from './config/run-mode';

const log = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const mode = getRunMode();
  if (mode === 'worker') {
    await bootstrapWorker();
    return;
  }
  await bootstrapApi(mode);
}

// api/all: HTTP server + scheduler (the latter via ScheduleModule, gated in
// AppModule). Owns the migration run so two processes never race runMigrations.
async function bootstrapApi(mode: string): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Required so SIGTERM from the container runtime triggers OnModuleDestroy
  // hooks (ioredis client quit, TypeORM pool drain) rather than killing mid-IO.
  app.enableShutdownHooks();

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const config = app.get(ConfigService<Env, true>);

  if (config.get('RUN_MIGRATIONS_ON_BOOT', { infer: true })) {
    const dataSource = app.get(DataSource);
    const ran = await dataSource.runMigrations();
    log.log(`Ran ${ran.length} migration(s)`);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  log.log(`Backend (mode=${mode}) listening on port ${port}`);
}

// worker: BullMQ processors only. No HTTP adapter (createApplicationContext
// binds no port), no scheduler. Lifecycle hooks still run, so the BullMQ
// WorkerHost processors start via onModuleInit. Migrations are the api
// process's job; the worker just consumes from queues that stay empty until
// the api is up and has migrated.
async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  log.log('Backend (mode=worker) started — BullMQ processors active, no HTTP server');
}

void bootstrap();

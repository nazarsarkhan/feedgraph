import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Required so SIGTERM from the container runtime triggers OnModuleDestroy
  // hooks (ioredis client quit, TypeORM pool drain) rather than killing mid-IO.
  app.enableShutdownHooks();

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const config = app.get(ConfigService<Env, true>);
  const log = new Logger('Bootstrap');

  if (config.get('RUN_MIGRATIONS_ON_BOOT', { infer: true })) {
    const dataSource = app.get(DataSource);
    const ran = await dataSource.runMigrations();
    log.log(`Ran ${ran.length} migration(s)`);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  log.log(`Backend listening on port ${port}`);
}

void bootstrap();

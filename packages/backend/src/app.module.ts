import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { type Env, validate } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      // Path is resolved against process.cwd(); in local dev cwd is
      // packages/backend, so this points at the repo-root .env. In Docker,
      // env vars come from compose and this path is intentionally missing
      // (ConfigModule silently skips a missing file).
      envFilePath: '../../.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        type: 'postgres',
        host: config.get('POSTGRES_HOST', { infer: true }),
        port: config.get('POSTGRES_PORT', { infer: true }),
        username: config.get('POSTGRES_USER', { infer: true }),
        password: config.get('POSTGRES_PASSWORD', { infer: true }),
        database: config.get('POSTGRES_DB', { infer: true }),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}

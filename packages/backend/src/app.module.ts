import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticleProcessModule } from './articles/process/article-process.module';
import { ArticlesModule } from './articles/articles.module';
import { AuthModule } from './auth/auth.module';
import { AxesModule } from './axes/axes.module';
import { CategoriesModule } from './categories/categories.module';
import { type Env, validate } from './config/env.schema';
import { SeedsModule } from './database/seeds/seeds.module';
import { DigestsModule } from './digests/digests.module';
import { FeedsModule } from './feeds/feeds.module';
import { GraphEntitiesModule } from './graph-entities/graph-entities.module';
import { HealthModule } from './health/health.module';
import { LlmModule } from './llm/llm.module';
import { PrefilterModule } from './prefilter/prefilter.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

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
        // __dirname is src/ during ts-node-dev and dist/ in the built image;
        // the .{ts,js} wildcard picks whichever exists at runtime.
        migrations: [path.join(__dirname, 'database/migrations/*.{ts,js}')],
      }),
    }),
    ScheduleModule.forRoot(),
    QueueModule,
    RedisModule,
    HealthModule,
    UsersModule,
    AuthModule,
    ArticlesModule,
    FeedsModule,
    CategoriesModule,
    AxesModule,
    PrefilterModule,
    LlmModule,
    GraphEntitiesModule,
    ArticleProcessModule,
    DigestsModule,
    SeedsModule,
  ],
})
export class AppModule {}

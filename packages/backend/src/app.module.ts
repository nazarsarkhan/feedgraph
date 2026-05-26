import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { type Env, validate } from './config/env.schema';
import { FeedsModule } from './feeds/feeds.module';
import { HealthModule } from './health/health.module';
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
    RedisModule,
    HealthModule,
    UsersModule,
    AuthModule,
    FeedsModule,
  ],
})
export class AppModule {}

import { Controller, Get, HttpException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

type ComponentStatus = 'up' | 'down';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: ComponentStatus;
  redis: ComponentStatus;
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const status: HealthResponse['status'] = db === 'up' && redis === 'up' ? 'ok' : 'degraded';
    const body: HealthResponse = { status, db, redis };

    // 503 (not 500) — the app is up but a dependency is degraded; orchestrators
    // and load balancers treat this as a "remove from rotation" signal.
    if (status !== 'ok') {
      throw new HttpException(body, 503);
    }
    return body;
  }

  private async checkDb(): Promise<ComponentStatus> {
    try {
      if (!this.dataSource.isInitialized) {
        return 'down';
      }
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}

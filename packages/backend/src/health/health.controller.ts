import { Controller, Get, HttpException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LlmService } from '../llm/llm.service';
import { RedisService } from '../redis/redis.service';

type ComponentStatus = 'up' | 'down';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: ComponentStatus;
  redis: ComponentStatus;
}

interface LlmHealthResponse {
  status: 'ok' | 'degraded';
  adapters: Array<{
    provider: string;
    model: string;
    role: 'primary' | 'failover';
    status: ComponentStatus;
  }>;
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly llm: LlmService,
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

  // Per-adapter LLM provider reachability. Separate from the main /health so
  // a flaky provider doesn't pull the whole app out of rotation — callers
  // poll this explicitly. 503 when any configured adapter is down.
  @Get('llm')
  async checkLlm(): Promise<LlmHealthResponse> {
    const adapters = await this.llm.pingAdapters();
    const status: LlmHealthResponse['status'] = adapters.every((a) => a.status === 'up')
      ? 'ok'
      : 'degraded';
    const body: LlmHealthResponse = { status, adapters };
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

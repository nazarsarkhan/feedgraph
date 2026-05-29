import { Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import type { Env } from '../config/env.schema';
import { UsersModule } from '../users/users.module';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import {
  LLM_ADAPTER,
  LLM_FAILOVER_ADAPTER,
  type LlmAdapter,
} from './adapters/llm-adapter.interface';
import { MockAdapter } from './adapters/mock.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { LlmCache } from './llm-cache.entity';
import { LlmCachePurgeService } from './llm-cache-purge.service';
import { LlmService } from './llm.service';
import { LlmTelemetry } from './llm-telemetry.entity';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

type ProviderName = 'mock' | 'openai' | 'anthropic';

// Single function constructs either adapter — used twice (primary + failover)
// so the env-to-adapter mapping lives in one place. env.schema's superRefine
// already guarantees the API keys for any selected provider exist; the
// runtime checks here are defense-in-depth in case the schema is loosened.
function buildAdapter(provider: ProviderName, config: ConfigService<Env, true>): LlmAdapter {
  if (provider === 'openai') {
    const apiKey = config.get('OPENAI_API_KEY', { infer: true });
    const model = config.get('OPENAI_MODEL', { infer: true });
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY missing despite env validation — env.schema bug?');
    }
    return new OpenAiAdapter(apiKey, model);
  }
  if (provider === 'anthropic') {
    const apiKey = config.get('ANTHROPIC_API_KEY', { infer: true });
    const model = config.get('ANTHROPIC_MODEL', { infer: true });
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY missing despite env validation — env.schema bug?');
    }
    return new AnthropicAdapter(apiKey, model);
  }
  return new MockAdapter();
}

const llmAdapterProvider: Provider = {
  provide: LLM_ADAPTER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): LlmAdapter => {
    const provider = config.get('LLM_ACTIVE_PROVIDER', { infer: true });
    return buildAdapter(provider, config);
  },
};

// Optional secondary adapter. We always provide the token (so LlmService's
// @Inject() resolves) and return null when no failover is configured —
// LlmService treats null as "no failover, propagate primary errors".
const llmFailoverAdapterProvider: Provider = {
  provide: LLM_FAILOVER_ADAPTER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): LlmAdapter | null => {
    const failover = config.get('LLM_FAILOVER_PROVIDER', { infer: true });
    const active = config.get('LLM_ACTIVE_PROVIDER', { infer: true });
    // superRefine in env.schema already forbids failover === active, but
    // belt-and-braces: if they ever match, behave as if failover is unset.
    if (!failover || failover === active) return null;
    return buildAdapter(failover, config);
  },
};

@Module({
  // AuthModule + UsersModule are needed for the EmailConfirmedGuard wired
  // onto TelemetryController — same pattern every per-user feature module
  // uses. Tracked in PLAN.md tech debt: AuthModule should re-export
  // UsersModule so per-feature imports drop this boilerplate.
  imports: [TypeOrmModule.forFeature([LlmCache, LlmTelemetry]), AuthModule, UsersModule],
  controllers: [TelemetryController],
  providers: [
    llmAdapterProvider,
    llmFailoverAdapterProvider,
    LlmService,
    TelemetryService,
    LlmCachePurgeService,
  ],
  exports: [LlmService],
})
export class LlmModule {}

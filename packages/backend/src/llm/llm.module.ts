import { Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from '../articles/article.entity';
import { AuthModule } from '../auth/auth.module';
import { AxesModule } from '../axes/axes.module';
import { CategoriesModule } from '../categories/categories.module';
import type { Env } from '../config/env.schema';
import { UsersModule } from '../users/users.module';
import { LLM_ADAPTER, type LlmAdapter } from './adapters/llm-adapter.interface';
import { MockAdapter } from './adapters/mock.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { DebugLlmController } from './debug-llm.controller';
import { LlmCache } from './llm-cache.entity';
import { LlmService } from './llm.service';
import { LlmTelemetry } from './llm-telemetry.entity';

// Single provider per process — LLM_ACTIVE_PROVIDER selects which adapter
// is instantiated for ALL LlmService methods. Mixing providers per-method
// is intentionally not supported (one set of caps, one set of telemetry).
const llmAdapterProvider: Provider = {
  provide: LLM_ADAPTER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): LlmAdapter => {
    const provider = config.get('LLM_ACTIVE_PROVIDER', { infer: true });
    if (provider === 'openai') {
      // env.schema's superRefine guarantees OPENAI_API_KEY is present here.
      const apiKey = config.get('OPENAI_API_KEY', { infer: true });
      const model = config.get('OPENAI_MODEL', { infer: true });
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY missing despite env validation — env.schema bug?');
      }
      return new OpenAiAdapter(apiKey, model);
    }
    return new MockAdapter();
  },
};

@Module({
  // UsersModule must be re-imported here so EmailConfirmedGuard (provided
  // by AuthModule but depending on UsersService) can resolve at injection
  // time for the debug controller. AxesModule / CategoriesModule expose
  // the services the debug endpoint needs to assemble the prompt context.
  imports: [
    TypeOrmModule.forFeature([Article, LlmCache, LlmTelemetry]),
    AuthModule,
    UsersModule,
    CategoriesModule,
    AxesModule,
  ],
  controllers: [DebugLlmController],
  providers: [llmAdapterProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}

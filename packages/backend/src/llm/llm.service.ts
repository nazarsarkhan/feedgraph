import { Inject, Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ArticleAnalysisSchema,
  buildAnalyzeArticlePrompt,
  type ArticleAnalysis,
  type DigestInput,
  type DigestResult,
  type EntityMatchInput,
  type EntityMatchResult,
} from '@feedgraph/shared';
import { Repository } from 'typeorm';
import type { Env } from '../config/env.schema';
import { LLM_ADAPTER, type LlmAdapter } from './adapters/llm-adapter.interface';
import { LlmCache } from './llm-cache.entity';
import { LlmTelemetry } from './llm-telemetry.entity';

export interface AnalyzeArticleInput {
  contentHash: string;
  content: string;
  title: string;
  userCategories: readonly string[];
  userAxes: ReadonlyArray<{ name: string; values: readonly string[] }>;
  userId?: string | null;
}

interface TelemetryRow {
  userId: string | null;
  provider: string;
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHit: boolean;
  latencyMs: number;
  success: boolean;
  errorMessage: string | null;
}

/**
 * Provider-neutral LLM contract. Cache lookup, telemetry, concurrency cap,
 * and token cap all live here. Adapters are pure transport — they take a
 * prompt and return parsed output (or throw). Switching providers is a
 * single env flip; mixing providers per-method is intentionally unsupported.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private readonly concurrency: number;
  private readonly maxTokens: number;

  // In-process semaphore: a counter plus a queue of resolvers. A slot is
  // either held by an in-flight request or transferred to the next waiter
  // on release (without bumping the counter). Per-Node, not per-cluster —
  // BullMQ concurrency is its own knob.
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    @InjectRepository(LlmCache) private readonly cache: Repository<LlmCache>,
    @InjectRepository(LlmTelemetry) private readonly telemetry: Repository<LlmTelemetry>,
    @Inject(LLM_ADAPTER) private readonly adapter: LlmAdapter,
    config: ConfigService<Env, true>,
  ) {
    this.concurrency = config.get('LLM_CONCURRENCY', { infer: true });
    this.maxTokens = config.get('LLM_MAX_TOKENS_PER_REQUEST', { infer: true });
    this.logger.log(
      `llm wired provider=${this.adapter.providerName} model=${this.adapter.modelName} concurrency=${this.concurrency} max_tokens=${this.maxTokens}`,
    );
  }

  async analyzeArticle(input: AnalyzeArticleInput): Promise<ArticleAnalysis> {
    const operation = 'analyze_article';
    const model = this.adapter.modelName;
    const provider = this.adapter.providerName;
    const userId = input.userId ?? null;

    const cacheStart = Date.now();
    const cached = await this.cache.findOne({
      where: { contentHash: input.contentHash, operation, model },
    });
    if (cached) {
      const cachedParsed = ArticleAnalysisSchema.safeParse(cached.resultJson);
      if (cachedParsed.success) {
        await this.writeTelemetry({
          userId,
          provider,
          model,
          operation,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cacheHit: true,
          latencyMs: Date.now() - cacheStart,
          success: true,
          errorMessage: null,
        });
        this.logger.log(
          `llm cache hit operation=${operation} model=${model} content_hash=${input.contentHash.slice(0, 12)}…`,
        );
        return cachedParsed.data;
      }
      // Cached row is corrupt — treat as miss and overwrite below.
      this.logger.warn(
        `llm cache row failed schema, treating as miss content_hash=${input.contentHash.slice(0, 12)}…`,
      );
    }

    await this.acquire();
    const callStart = Date.now();
    try {
      const prompt = buildAnalyzeArticlePrompt({
        title: input.title,
        content: input.content,
        userCategories: input.userCategories,
        userAxes: input.userAxes,
      });

      const { result, promptTokens, completionTokens } = await this.adapter.callJson({
        prompt,
        schema: ArticleAnalysisSchema,
        maxTokens: this.maxTokens,
        operation,
      });

      // Defense in depth — re-validate in case an adapter bug let an
      // off-schema object through. The adapter is supposed to validate.
      const revalidated = ArticleAnalysisSchema.parse(result);

      const latencyMs = Date.now() - callStart;

      // Upsert by (content_hash, operation, model) — orIgnore so a
      // racing duplicate call doesn't crash this path.
      await this.cache
        .createQueryBuilder()
        .insert()
        .values({
          contentHash: input.contentHash,
          operation,
          model,
          resultJson: revalidated,
        })
        .orIgnore()
        .execute();

      await this.writeTelemetry({
        userId,
        provider,
        model,
        operation,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cacheHit: false,
        latencyMs,
        success: true,
        errorMessage: null,
      });

      this.logger.log(
        `llm call ok provider=${provider} model=${model} op=${operation} prompt_tokens=${promptTokens} completion_tokens=${completionTokens} latency_ms=${latencyMs}`,
      );

      return revalidated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown LLM error';
      await this.writeTelemetry({
        userId,
        provider,
        model,
        operation,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cacheHit: false,
        latencyMs: Date.now() - callStart,
        success: false,
        errorMessage: message,
      });
      this.logger.error(
        `llm call failed provider=${provider} op=${operation}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    } finally {
      this.release();
    }
  }

  async matchEntities(_input: EntityMatchInput): Promise<EntityMatchResult> {
    throw new NotImplementedException('matchEntities is not implemented yet');
  }

  async buildDigest(_input: DigestInput): Promise<DigestResult> {
    throw new NotImplementedException('buildDigest is not implemented yet');
  }

  private async acquire(): Promise<void> {
    if (this.inFlight < this.concurrency) {
      this.inFlight++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Slot transferred — inFlight stays at cap, waiter proceeds.
      next();
    } else {
      this.inFlight--;
    }
  }

  private async writeTelemetry(row: TelemetryRow): Promise<void> {
    try {
      await this.telemetry.insert(row);
    } catch (err) {
      // Telemetry write must never break the request path. Log loudly and
      // swallow — losing a telemetry row is acceptable; surfacing a DB
      // hiccup to the caller is not.
      const message = err instanceof Error ? err.message : 'Unknown telemetry error';
      this.logger.error(`telemetry write failed: ${message}`);
    }
  }
}

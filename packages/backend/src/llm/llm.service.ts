import { createHash } from 'crypto';
import { Inject, Injectable, Logger, NotImplementedException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ArticleAnalysisSchema,
  buildAnalyzeArticlePrompt,
  buildMatchEntitiesPrompt,
  MatchEntitiesOutputSchema,
  type ArticleAnalysis,
  type DigestInput,
  type DigestResult,
  type MatchEntitiesInput,
  type MatchEntitiesOutput,
} from '@feedgraph/shared';
import { Repository } from 'typeorm';
import type { ZodType } from 'zod';
import type { Env } from '../config/env.schema';
import {
  LLM_ADAPTER,
  LLM_FAILOVER_ADAPTER,
  type LlmAdapter,
} from './adapters/llm-adapter.interface';
import { LlmRetriableError } from './adapters/llm-retriable-error';
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
  failoverFrom: string | null;
}

interface AdapterCallOutcome<T> {
  result: T;
  promptTokens: number;
  completionTokens: number;
  providerUsed: string;
  modelUsed: string;
  failoverFrom: string | null;
}

/**
 * Provider-neutral LLM contract. Cache lookup, telemetry, concurrency cap,
 * token cap, and failover all live here. Adapters are pure transport — they
 * take a prompt and return parsed output (or throw). Failover triggers
 * exclusively on LlmRetriableError; other errors propagate.
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
    @Optional()
    @Inject(LLM_FAILOVER_ADAPTER)
    private readonly failoverAdapter: LlmAdapter | null,
    config: ConfigService<Env, true>,
  ) {
    this.concurrency = config.get('LLM_CONCURRENCY', { infer: true });
    this.maxTokens = config.get('LLM_MAX_TOKENS_PER_REQUEST', { infer: true });
    const failoverInfo = this.failoverAdapter
      ? `${this.failoverAdapter.providerName}/${this.failoverAdapter.modelName}`
      : 'none';
    this.logger.log(
      `llm wired primary=${this.adapter.providerName}/${this.adapter.modelName} failover=${failoverInfo} concurrency=${this.concurrency} max_tokens=${this.maxTokens}`,
    );
  }

  async analyzeArticle(input: AnalyzeArticleInput): Promise<ArticleAnalysis> {
    const operation = 'analyze_article';
    const userId = input.userId ?? null;

    // Cache lookup uses the PRIMARY adapter's model only. If a previous call
    // failed over to the secondary, its result was cached under the
    // secondary's model key — that's a separate cache lane on purpose
    // (see ADR: failover cache lane is its own).
    const primaryModel = this.adapter.modelName;
    const primaryProvider = this.adapter.providerName;

    const cacheStart = Date.now();
    const cached = await this.cache.findOne({
      where: { contentHash: input.contentHash, operation, model: primaryModel },
    });
    if (cached) {
      const cachedParsed = ArticleAnalysisSchema.safeParse(cached.resultJson);
      if (cachedParsed.success) {
        await this.writeTelemetry({
          userId,
          provider: primaryProvider,
          model: primaryModel,
          operation,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cacheHit: true,
          latencyMs: Date.now() - cacheStart,
          success: true,
          errorMessage: null,
          failoverFrom: null,
        });
        this.logger.log(
          `llm cache hit operation=${operation} model=${primaryModel} content_hash=${input.contentHash.slice(0, 12)}…`,
        );
        return cachedParsed.data;
      }
      this.logger.warn(
        `llm cache row failed schema, treating as miss content_hash=${input.contentHash.slice(0, 12)}…`,
      );
    }

    const prompt = buildAnalyzeArticlePrompt({
      title: input.title,
      content: input.content,
      userCategories: input.userCategories,
      userAxes: input.userAxes,
    });

    await this.acquire();
    try {
      const outcome = await this.callWithFailover<ArticleAnalysis>({
        userId,
        operation,
        prompt,
        schema: ArticleAnalysisSchema,
      });

      // Defense in depth — re-validate in case an adapter let off-schema
      // data through.
      const revalidated = ArticleAnalysisSchema.parse(outcome.result);

      // Cache under the model that ACTUALLY produced this result. On a
      // failover, that's the secondary's model — so the primary's cache
      // lane stays clean.
      await this.cache
        .createQueryBuilder()
        .insert()
        .values({
          contentHash: input.contentHash,
          operation,
          model: outcome.modelUsed,
          resultJson: revalidated,
        })
        .orIgnore()
        .execute();

      return revalidated;
    } finally {
      this.release();
    }
  }

  /**
   * Fuzzy entity deduplication. The cache key is sha256 over the entity
   * set's structural identity (`(id, canonicalName, type)` per entity,
   * sorted by id so call-order doesn't change the hash). Aliases are
   * NOT in the cache key — we want a follow-up call after a no-op merge
   * to be a hit. After a real merge the entity set changes (rows
   * removed), so the next call gets a different hash and a miss, which
   * is the right behaviour.
   *
   * userId flows through to telemetry; the caller (EntityDedupService)
   * validates every returned id against the userId's entity set before
   * any DB write, so this method does not need to enforce tenancy.
   */
  async matchEntities(input: MatchEntitiesInput, userId: string): Promise<MatchEntitiesOutput> {
    const operation = 'match_entities';
    const primaryModel = this.adapter.modelName;
    const primaryProvider = this.adapter.providerName;

    const cacheKey = createHash('sha256')
      .update(
        JSON.stringify(
          [...input.entities]
            .map((e) => ({ id: e.id, name: e.canonicalName, type: e.type }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        ),
      )
      .digest('hex');

    const cacheStart = Date.now();
    const cached = await this.cache.findOne({
      where: { contentHash: cacheKey, operation, model: primaryModel },
    });
    if (cached) {
      const cachedParsed = MatchEntitiesOutputSchema.safeParse(cached.resultJson);
      if (cachedParsed.success) {
        await this.writeTelemetry({
          userId,
          provider: primaryProvider,
          model: primaryModel,
          operation,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cacheHit: true,
          latencyMs: Date.now() - cacheStart,
          success: true,
          errorMessage: null,
          failoverFrom: null,
        });
        this.logger.log(
          `llm cache hit operation=${operation} model=${primaryModel} cache_key=${cacheKey.slice(0, 12)}…`,
        );
        return cachedParsed.data;
      }
      this.logger.warn(
        `llm cache row failed schema, treating as miss cache_key=${cacheKey.slice(0, 12)}…`,
      );
    }

    const prompt = buildMatchEntitiesPrompt(input);

    await this.acquire();
    try {
      const outcome = await this.callWithFailover<MatchEntitiesOutput>({
        userId,
        operation,
        prompt,
        schema: MatchEntitiesOutputSchema,
      });

      const revalidated = MatchEntitiesOutputSchema.parse(outcome.result);

      await this.cache
        .createQueryBuilder()
        .insert()
        .values({
          contentHash: cacheKey,
          operation,
          model: outcome.modelUsed,
          resultJson: revalidated,
        })
        .orIgnore()
        .execute();

      return revalidated;
    } finally {
      this.release();
    }
  }

  async buildDigest(_input: DigestInput): Promise<DigestResult> {
    throw new NotImplementedException('buildDigest is not implemented yet');
  }

  /**
   * Try the primary adapter; on a retriable error, write a failed-primary
   * telemetry row and attempt the secondary if one is configured. Non-
   * retriable errors propagate (and produce a single failed-primary
   * telemetry row before being re-thrown).
   *
   * Returns the call outcome with `providerUsed` / `modelUsed` set to
   * whichever adapter actually produced the result, and `failoverFrom`
   * naming the provider we failed over from (null on the happy path).
   */
  private async callWithFailover<T>(args: {
    userId: string | null;
    operation: string;
    prompt: string;
    schema: ZodType<T>;
  }): Promise<AdapterCallOutcome<T>> {
    const { userId, operation, prompt, schema } = args;

    const primary = this.adapter;
    const primaryStart = Date.now();
    try {
      const { result, promptTokens, completionTokens } = await primary.callJson<T>({
        prompt,
        schema,
        maxTokens: this.maxTokens,
        operation,
      });
      const latencyMs = Date.now() - primaryStart;
      await this.writeTelemetry({
        userId,
        provider: primary.providerName,
        model: primary.modelName,
        operation,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cacheHit: false,
        latencyMs,
        success: true,
        errorMessage: null,
        failoverFrom: null,
      });
      this.logger.log(
        `llm call ok provider=${primary.providerName} model=${primary.modelName} op=${operation} prompt_tokens=${promptTokens} completion_tokens=${completionTokens} latency_ms=${latencyMs}`,
      );
      return {
        result,
        promptTokens,
        completionTokens,
        providerUsed: primary.providerName,
        modelUsed: primary.modelName,
        failoverFrom: null,
      };
    } catch (err) {
      const primaryLatency = Date.now() - primaryStart;
      const primaryMessage = err instanceof Error ? err.message : 'Unknown LLM error';
      // Always record the failed primary attempt — whether or not failover
      // is configured, the dashboard wants to see the failure.
      await this.writeTelemetry({
        userId,
        provider: primary.providerName,
        model: primary.modelName,
        operation,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cacheHit: false,
        latencyMs: primaryLatency,
        success: false,
        errorMessage: primaryMessage,
        failoverFrom: null,
      });

      if (!(err instanceof LlmRetriableError) || !this.failoverAdapter) {
        this.logger.error(
          `llm call failed provider=${primary.providerName} op=${operation} retriable=${err instanceof LlmRetriableError} failover_configured=${!!this.failoverAdapter}: ${primaryMessage}`,
          err instanceof Error ? err.stack : undefined,
        );
        throw err;
      }

      const secondary = this.failoverAdapter;
      this.logger.warn(
        `llm primary failed, attempting failover provider=${secondary.providerName} from=${primary.providerName}: ${primaryMessage}`,
      );

      const secondaryStart = Date.now();
      try {
        const { result, promptTokens, completionTokens } = await secondary.callJson<T>({
          prompt,
          schema,
          maxTokens: this.maxTokens,
          operation,
        });
        const latencyMs = Date.now() - secondaryStart;
        await this.writeTelemetry({
          userId,
          provider: secondary.providerName,
          model: secondary.modelName,
          operation,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          cacheHit: false,
          latencyMs,
          success: true,
          errorMessage: null,
          failoverFrom: primary.providerName,
        });
        this.logger.log(
          `llm failover ok provider=${secondary.providerName} model=${secondary.modelName} op=${operation} prompt_tokens=${promptTokens} completion_tokens=${completionTokens} latency_ms=${latencyMs} failover_from=${primary.providerName}`,
        );
        return {
          result,
          promptTokens,
          completionTokens,
          providerUsed: secondary.providerName,
          modelUsed: secondary.modelName,
          failoverFrom: primary.providerName,
        };
      } catch (secondaryErr) {
        const secondaryLatency = Date.now() - secondaryStart;
        const secondaryMessage =
          secondaryErr instanceof Error ? secondaryErr.message : 'Unknown LLM error';
        await this.writeTelemetry({
          userId,
          provider: secondary.providerName,
          model: secondary.modelName,
          operation,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cacheHit: false,
          latencyMs: secondaryLatency,
          success: false,
          errorMessage: secondaryMessage,
          failoverFrom: primary.providerName,
        });
        this.logger.error(
          `llm failover failed provider=${secondary.providerName} op=${operation}: ${secondaryMessage}`,
          secondaryErr instanceof Error ? secondaryErr.stack : undefined,
        );
        // Both providers failed — surface the secondary error to the
        // caller; the primary's error is already captured in telemetry.
        throw secondaryErr;
      }
    }
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
      next();
    } else {
      this.inFlight--;
    }
  }

  private async writeTelemetry(row: TelemetryRow): Promise<void> {
    try {
      await this.telemetry.insert(row);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown telemetry error';
      this.logger.error(`telemetry write failed: ${message}`);
    }
  }
}

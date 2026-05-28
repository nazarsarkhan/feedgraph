import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { DataSource } from 'typeorm';
import type { Env } from '../config/env.schema';

/**
 * Generates and stores per-article embeddings (pgvector vector(1536))
 * and finds similar pairs via cosine distance. Multi-tenant: every
 * SELECT joins `articles` so the user_id filter applies; the
 * embeddings table itself has no user_id column because deleting an
 * article cascades and the join always carries us back to that
 * tenant scope.
 *
 * Provider selection mirrors the rest of LlmService:
 *   - LLM_ACTIVE_PROVIDER=openai + OPENAI_API_KEY  →  text-embedding-3-small
 *   - LLM_ACTIVE_PROVIDER=mock (default)            →  deterministic
 *                                                       djb2-seeded unit vector
 *
 * The mock vectors are uniformly distributed unit vectors in
 * 1536-dim space, so cosine similarity between two distinct texts is
 * centered around 0 (effectively orthogonal). That sounds useless,
 * but the demo seed contains cross-source duplicate clusters (same
 * article from multiple feeds) — those have identical or
 * near-identical (title + summary) text, so they produce identical
 * vectors → similarity 1.0 → similar edges appear in the graph. Real
 * OpenAI embeddings will catch subtler semantic neighbours.
 */

export interface EmbedResult {
  embedded: number;
  skipped: number;
  errors: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly openai: OpenAI | null;
  private readonly modelName: string;
  // Cap matches the user's spec: 200 articles per call so a power-
  // user with thousands of processed articles doesn't accidentally
  // pay for thousands of embeddings in one click. The endpoint is
  // re-callable; a second click picks up the next 200 (LEFT JOIN
  // article_embeddings IS NULL).
  private static readonly EMBED_BATCH_LIMIT = 200;
  // OpenAI's /v1/embeddings accepts up to 2048 inputs per request,
  // but smaller batches keep latency predictable and bound the cost
  // of a single retried failure. 20 is comfortably below any rate
  // limit at MVP scale.
  private static readonly BATCH_SIZE = 20;
  // Per-input text length cap. text-embedding-3-small takes up to
  // 8191 tokens; we don't need that much for a (title + summary)
  // pair and the truncation keeps the cost predictable.
  private static readonly MAX_TEXT_CHARS = 512;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<Env, true>,
  ) {
    const provider = config.get('LLM_ACTIVE_PROVIDER', { infer: true });
    const apiKey = config.get('OPENAI_API_KEY', { infer: true });
    if (provider === 'openai' && apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.modelName = 'text-embedding-3-small';
    } else {
      this.openai = null;
      this.modelName = 'mock';
    }
    this.logger.log(`embedding service wired provider=${this.openai ? 'openai' : 'mock'}`);
  }

  /**
   * Generate and store embeddings for up to EMBED_BATCH_LIMIT
   * processed articles that don't have an embedding yet. Idempotent:
   * a second call picks up where the first left off (LEFT JOIN
   * IS NULL). Re-runs after a partial failure pick up only the rows
   * that failed.
   */
  async embedAll(userId: string): Promise<EmbedResult> {
    const articles = (await this.dataSource.query(
      `SELECT a.id, a.title, a.summary
       FROM articles a
       LEFT JOIN article_embeddings ae ON ae.article_id = a.id
       WHERE a.user_id = $1
         AND a.status = 'processed'
         AND ae.article_id IS NULL
       ORDER BY a.published_at DESC NULLS LAST
       LIMIT $2`,
      [userId, EmbeddingService.EMBED_BATCH_LIMIT],
    )) as Array<{ id: string; title: string | null; summary: string | null }>;

    if (articles.length === 0) {
      return { embedded: 0, skipped: 0, errors: 0 };
    }

    let embedded = 0;
    let errors = 0;
    for (let i = 0; i < articles.length; i += EmbeddingService.BATCH_SIZE) {
      const batch = articles.slice(i, i + EmbeddingService.BATCH_SIZE);
      const texts = batch.map((a) =>
        `${a.title ?? ''} ${a.summary ?? ''}`.trim().slice(0, EmbeddingService.MAX_TEXT_CHARS),
      );
      try {
        const vectors = await this.getEmbeddings(texts);
        for (let j = 0; j < batch.length; j++) {
          await this.dataSource.query(
            `INSERT INTO article_embeddings (article_id, embedding, model)
             VALUES ($1, $2::vector, $3)
             ON CONFLICT (article_id) DO NOTHING`,
            [batch[j].id, vectorToLiteral(vectors[j]), this.modelName],
          );
        }
        embedded += batch.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `embedding batch failed user=${userId} batch_start=${i} size=${batch.length}: ${message}`,
        );
        errors += batch.length;
      }
    }

    this.logger.log(
      `embedAll user=${userId} candidates=${articles.length} embedded=${embedded} errors=${errors}`,
    );
    return { embedded, skipped: 0, errors };
  }

  private async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (this.openai) {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      return response.data.map((d) => d.embedding);
    }
    return texts.map((t) => mockEmbedding(t));
  }
}

/**
 * Deterministic 1536-dim L2-normalised unit vector seeded from the
 * text. Two identical inputs produce identical vectors → cosine
 * similarity 1.0; two distinct inputs are effectively orthogonal in
 * expectation. That's enough to surface the demo seed's
 * cross-source duplicate clusters without an API key.
 */
function mockEmbedding(text: string): number[] {
  const DIMS = 1536;
  // sha256 gives us a 32-byte seed — enough entropy to make the
  // per-dimension hashes well-distributed without a real PRNG.
  const seedHex = createHash('sha256').update(text).digest('hex');
  const vec = new Array<number>(DIMS);
  let sumSq = 0;
  for (let i = 0; i < DIMS; i++) {
    const h = djb2(`${seedHex}:${i}`);
    // Map h (32-bit unsigned) into [-1, 1).
    const x = (h & 0xffff) / 0xffff;
    vec[i] = x * 2 - 1;
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < DIMS; i++) vec[i] /= norm;
  return vec;
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

function vectorToLiteral(vec: number[]): string {
  // pgvector accepts the text form `[v1,v2,...]` for INSERT. Six
  // decimal places balances precision and payload size — the
  // OpenAI embeddings come back as JS numbers with ~17 digits and
  // any precision below ~3 decimals would alter cosine similarities
  // measurably; 6 is comfortable.
  return `[${vec.map((v) => v.toFixed(6)).join(',')}]`;
}

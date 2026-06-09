import { z } from 'zod';

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_HOST: z.string().min(1).default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  PORT: z.coerce.number().int().positive().default(3000),
  // Min 32 chars (~128 bits at base64) to fail fast on accidental weak secrets.
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRATION: z.string().default('7d'),
  // Public-facing origin of the SPA (nginx in front of the frontend). Used
  // to build links surfaced to users (email confirmation, future password
  // reset, etc.) — these must land on the SPA, not the API.
  APP_URL: z.string().url().default('http://localhost:8080'),
  // Coerce explicit 'true'/'false' to boolean — z.coerce.boolean() treats
  // any non-empty string as true, which would silently ignore 'false'.
  RUN_MIGRATIONS_ON_BOOT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Upper bound on the rss-parser live-validation HTTP request before we
  // reject a new feed as unreachable. Keep tight: this runs in the create
  // handler, not in a background job.
  FEED_VALIDATION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  FEED_POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  FEED_POLL_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  // Heuristic pre-filter thresholds. Changing these is operational; the rule
  // list itself is in code (PrefilterService.PREFILTER_RULES) and requires
  // review. We do not re-filter existing articles when these change — see
  // PLAN.md tech debt.
  PREFILTER_MIN_CONTENT_LENGTH: z.coerce.number().int().nonnegative().default(200),
  PREFILTER_MAX_LINK_DENSITY: z.coerce.number().min(0).max(1).default(0.3),
  PREFILTER_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  // LLM-bound; keep low. The LlmService in-process semaphore (LLM_CONCURRENCY)
  // is the true cap on concurrent provider calls — this knob governs how many
  // BullMQ jobs are simultaneously attempted, of which fewer end up
  // actually in-flight at the provider thanks to the semaphore queue.
  ARTICLE_PROCESS_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(3),
  // Active LLM provider. 'mock' is a deliberate default — a fresh clone of
  // the repo runs end-to-end without any API key. Switch to 'openai' or
  // 'anthropic' only when the matching key is configured.
  LLM_ACTIVE_PROVIDER: z.enum(['openai', 'anthropic', 'mock']).default('mock'),
  // Optional failover provider. If set and different from active, primary
  // retriable failures cascade to this provider before propagating. Unset
  // (or set to the same as active) disables failover entirely.
  LLM_FAILOVER_PROVIDER: z
    .enum(['openai', 'anthropic', 'mock'])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  LLM_CONCURRENCY: z.coerce.number().int().positive().default(3),
  LLM_MAX_TOKENS_PER_REQUEST: z.coerce.number().int().positive().default(4000),
  // LLM result cache lifetime. 0 means never expire (content-hash determinism
  // makes a hit valid forever); a positive value sets expires_at = now() + N
  // days on write and the daily purge job deletes stale rows. See PLAN.md.
  LLM_CACHE_TTL_DAYS: z.coerce.number().int().nonnegative().default(0),
  // Circuit breaker on the primary adapter inside LlmService.callWithFailover.
  // After THRESHOLD consecutive retriable failures the breaker opens and
  // primary is skipped (straight to failover) for COOLDOWN_MS, then half-opens
  // to trial one call. Per-process, matches the in-process semaphore scope.
  LLM_BREAKER_THRESHOLD: z.coerce.number().int().positive().default(5),
  LLM_BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(30_000),
  // Fuzzy entity-dedup acceptance threshold (matchEntities confidence). Merges
  // below this are dropped. Was hard-coded 0.8; promoted to env per PLAN.md.
  ENTITY_DEDUP_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.8),
  // Per-batch entity count for the async dedup worker. The matchEntities prompt
  // embeds each batch as JSON, so this bounds prompt size; the worker walks the
  // user's full entity set one batch at a time. Was a hard-coded 200-entity cap
  // on the old synchronous path — now the set is processed in full, in batches.
  ENTITY_DEDUP_BATCH_SIZE: z.coerce.number().int().positive().default(200),
  // BullMQ parallelism for the ENTITY_DEDUP queue. Default 1: a dedup job
  // mutates a user's whole entity set in a transaction, so serializing per
  // worker keeps merges simple to reason about. Per-user concurrency is also
  // capped to one in-flight job at enqueue time (see EntityDedupService).
  ENTITY_DEDUP_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  // BullMQ parallelism for the DIGEST queue. Default 1: digest generation is a
  // single LLM round-trip per job and idempotent on (user, period), so there's
  // no concurrency-correctness need — per-(user,period) single-flight is also
  // enforced at enqueue time (see DigestsService.enqueueOrGet).
  DIGEST_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  // Optional scheduled digest generation. Off by default — digests are an
  // on-demand action. When enabled, a cron tick generates the prior period's
  // digest for every user with activity. Cron in-process (@nestjs/schedule),
  // same pattern as feed polling.
  DIGEST_CRON_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DIGEST_CRON_EXPR: z.string().min(1).default('0 6 * * *'),
  // OPENAI_API_KEY / ANTHROPIC_API_KEY are optional at the type level — the
  // conditional refine below requires them only when the matching provider
  // is selected (as active OR failover). Empty strings (a common dotenv
  // artifact) are normalized to undefined first.
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-haiku-4-5-20251001'),
  // Demo data: pre-fabricated articles/entities so a reviewer can log in and
  // immediately see a working graph. Default true in docker-compose, false
  // for unit tests / fresh local-only setups that prefer empty state. The
  // seed is idempotent (skips if the demo user exists) so a `true` value is
  // safe to leave on across restarts.
  SEED_DEMO_ON_BOOT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Optional live-demo mode: after the static fixtures land, also add a real
  // RSS feed and trigger one live poll so a reviewer can watch the pipeline
  // execute. Needs internet + (ideally) an LLM key. Off by default so the
  // fixture-only demo never depends on the network.
  SEED_DEMO_LIVE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SEED_DEMO_LIVE_FEED_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  // Process role. 'all' runs API + workers + scheduler in one process (the
  // default, single-container deploy). 'api' serves HTTP + cron only; 'worker'
  // runs BullMQ processors only. Split lets workers scale independently.
  RUN_MODE: z.enum(['all', 'api', 'worker']).default('all'),
});

export const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  const usesOpenAi =
    data.LLM_ACTIVE_PROVIDER === 'openai' || data.LLM_FAILOVER_PROVIDER === 'openai';
  const usesAnthropic =
    data.LLM_ACTIVE_PROVIDER === 'anthropic' || data.LLM_FAILOVER_PROVIDER === 'anthropic';
  if (usesOpenAi && !data.OPENAI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message:
        'OPENAI_API_KEY is required when LLM_ACTIVE_PROVIDER or LLM_FAILOVER_PROVIDER is openai',
    });
  }
  if (usesAnthropic && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ANTHROPIC_API_KEY'],
      message:
        'ANTHROPIC_API_KEY is required when LLM_ACTIVE_PROVIDER or LLM_FAILOVER_PROVIDER is anthropic',
    });
  }
  if (
    data.LLM_FAILOVER_PROVIDER !== undefined &&
    data.LLM_FAILOVER_PROVIDER === data.LLM_ACTIVE_PROVIDER
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['LLM_FAILOVER_PROVIDER'],
      message: 'LLM_FAILOVER_PROVIDER must differ from LLM_ACTIVE_PROVIDER (or be unset)',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

// Surface missing/invalid env at boot rather than at the first request that
// happens to read the bad value. NestJS calls this once during ConfigModule
// init and propagates the thrown error as a fatal startup failure.
export function validate(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return result.data;
}

import { z } from 'zod';

export const envSchema = z.object({
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
  APP_URL: z.string().url().default('http://localhost:3000'),
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

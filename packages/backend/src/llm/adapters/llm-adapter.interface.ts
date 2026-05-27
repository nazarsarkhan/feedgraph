import type { ZodType } from 'zod';

export interface LlmCallArgs<T> {
  prompt: string;
  schema: ZodType<T>;
  maxTokens: number;
  // Used by adapters as the json_schema name in OpenAI / for branching in
  // the mock. Also surfaces in telemetry rows so cache/usage can be sliced
  // by operation downstream.
  operation: string;
}

export interface LlmCallResult<T> {
  result: T;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Pure transport contract. Adapters do not touch the cache, telemetry, or
 * the semaphore — those live in LlmService. Adapters take a prompt and a
 * schema, hit (or simulate) the provider, return parsed + validated output.
 * Errors are re-thrown so the service can record a failure telemetry row.
 */
export interface LlmAdapter {
  readonly providerName: string;
  readonly modelName: string;

  callJson<T>(args: LlmCallArgs<T>): Promise<LlmCallResult<T>>;
}

export const LLM_ADAPTER = Symbol('LLM_ADAPTER');
// Optional secondary adapter. Provided as `null` when LLM_FAILOVER_PROVIDER
// is unset or equals the active provider — LlmService treats null as "no
// failover configured, propagate primary errors".
export const LLM_FAILOVER_ADAPTER = Symbol('LLM_FAILOVER_ADAPTER');

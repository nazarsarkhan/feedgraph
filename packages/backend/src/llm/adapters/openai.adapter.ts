import OpenAI from 'openai';
import { z } from 'zod';
import type { LlmAdapter, LlmCallArgs, LlmCallResult } from './llm-adapter.interface';
import { LlmRetriableError } from './llm-retriable-error';

export class OpenAiAdapter implements LlmAdapter {
  readonly providerName = 'openai';
  readonly modelName: string;

  private readonly client: OpenAI;

  constructor(apiKey: string, model: string) {
    // The OpenAI client holds the API key internally; we never log it or
    // expose it through a public field on this class.
    this.client = new OpenAI({ apiKey });
    this.modelName = model;
  }

  async ping(): Promise<void> {
    // models.list is a cheap GET (no completion tokens) that confirms the
    // key is valid and the API is reachable.
    await this.client.models.list();
  }

  async callJson<T>(args: LlmCallArgs<T>): Promise<LlmCallResult<T>> {
    const { prompt, schema, maxTokens, operation } = args;

    // zod v4 emits standard JSON Schema with additionalProperties: false and
    // every property in required — exactly what OpenAI strict mode requires.
    // We strip $schema because OpenAI rejects unknown top-level keywords in
    // strict mode.
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    delete jsonSchema.$schema;

    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: operation,
            strict: true,
            schema: jsonSchema,
          },
        },
        max_completion_tokens: maxTokens,
      });
    } catch (err) {
      throw this.classifyError(err);
    }

    const text = completion.choices[0]?.message?.content;
    if (typeof text !== 'string' || text.length === 0) {
      // Empty/missing content from a strict json_schema response usually
      // means the model hit max_tokens mid-emit or refused. Retriable —
      // failover may succeed under a different model.
      throw new LlmRetriableError(
        `openai adapter: empty content from model finish_reason=${completion.choices[0]?.finish_reason}`,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      // Strict mode is supposed to make this impossible; if it happens the
      // primary just shipped malformed JSON. Failover.
      const message = err instanceof Error ? err.message : 'JSON parse failed';
      throw new LlmRetriableError(`openai adapter: invalid JSON in response: ${message}`, {
        cause: err,
      });
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new LlmRetriableError(
        `openai adapter: response did not match schema: ${parsed.error.message}`,
      );
    }

    return {
      result: parsed.data,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    };
  }

  /**
   * Classify SDK errors for the failover policy.
   *
   * Retriable (failover may help):
   *   - 5xx, 429 — transient provider trouble
   *   - 401, 403 — provider-specific auth/permission; the secondary has
   *     INDEPENDENT credentials, so failover often succeeds
   *   - Network/timeout/abort (no `.status`)
   *
   * Non-retriable (failover would hit the same wall on secondary):
   *   - 400, 404, 422 — request-shape errors (malformed JSON, unknown model)
   *     that would repeat on any provider given the same input
   */
  private classifyError(err: unknown): Error {
    const status = (err as { status?: number })?.status;
    const baseMessage = err instanceof Error ? err.message : String(err);

    if (
      status === 429 ||
      status === 401 ||
      status === 403 ||
      (typeof status === 'number' && status >= 500)
    ) {
      return new LlmRetriableError(`openai ${status}: ${baseMessage}`, { cause: err });
    }
    if (typeof status === 'number') {
      return new Error(`openai ${status}: ${baseMessage}`, { cause: err });
    }
    return new LlmRetriableError(`openai network error: ${baseMessage}`, { cause: err });
  }
}

import OpenAI from 'openai';
import { z } from 'zod';
import type { LlmAdapter, LlmCallArgs, LlmCallResult } from './llm-adapter.interface';

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
      const message = err instanceof Error ? err.message : 'OpenAI request failed';
      throw new Error(`openai adapter failure: ${message}`, { cause: err });
    }

    const text = completion.choices[0]?.message?.content;
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error(
        `openai adapter: empty content from model finish_reason=${completion.choices[0]?.finish_reason}`,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'JSON parse failed';
      throw new Error(`openai adapter: invalid JSON in response: ${message}`, { cause: err });
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`openai adapter: response did not match schema: ${parsed.error.message}`);
    }

    return {
      result: parsed.data,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    };
  }
}

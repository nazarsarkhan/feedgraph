import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { LlmAdapter, LlmCallArgs, LlmCallResult } from './llm-adapter.interface';
import { LlmRetriableError } from './llm-retriable-error';

/**
 * Anthropic has no native JSON-mode. The documented equivalent is forced
 * Tool Use: declare a tool whose input_schema is our JSON Schema, set
 * tool_choice to that tool by name, and read the resulting tool_use block's
 * `input` as the structured payload. Defense-in-depth zod validation on
 * the result side mirrors what OpenAiAdapter does for json_schema strict.
 */
export class AnthropicAdapter implements LlmAdapter {
  readonly providerName = 'anthropic';
  readonly modelName: string;

  private readonly client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.modelName = model;
  }

  async callJson<T>(args: LlmCallArgs<T>): Promise<LlmCallResult<T>> {
    const { prompt, schema, maxTokens, operation } = args;

    // Same JSON Schema emit as OpenAI: zod v4's native toJSONSchema gives us
    // additionalProperties: false and every property in `required`. Strip
    // $schema since Anthropic ignores it but typed it out is cleaner.
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    delete jsonSchema.$schema;

    const tool: Anthropic.Tool = {
      name: operation,
      description: `Return the ${operation} result as structured JSON via this tool call.`,
      input_schema: jsonSchema as Anthropic.Tool['input_schema'],
    };

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: maxTokens,
        tools: [tool],
        // Forces the model to emit exactly this tool — no free-text response.
        tool_choice: { type: 'tool', name: operation },
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (err) {
      throw this.classifyError(err);
    }

    const toolUseBlock = response.content.find(
      (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
    );
    if (!toolUseBlock) {
      // The model declined to use the tool (refusal, max_tokens cut, etc.).
      // Treat as retriable — failover may succeed even if this primary won't.
      throw new LlmRetriableError(
        `anthropic adapter: model returned no tool_use block (stop_reason=${response.stop_reason})`,
      );
    }

    const parsed = schema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      // Schema-mismatch from a strict tool is rare — when it happens the
      // primary's output is in a bad state; failover is the right move.
      throw new LlmRetriableError(
        `anthropic adapter: tool input did not match schema: ${parsed.error.message}`,
      );
    }

    return {
      result: parsed.data,
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
    };
  }

  /**
   * Same classification policy as OpenAiAdapter. Retriable: 5xx, 429, 401,
   * 403, network errors. Non-retriable: other 4xx (400, 404, 422) — those
   * indicate a request-shape problem that would repeat on the secondary.
   * Auth (401/403) is retriable because the secondary has independent
   * credentials and may well succeed even when this provider's auth is
   * broken.
   *
   * We never surface the raw error message in production logs — the SDK
   * redacts sensitive bits in its `.message`, and we wrap with `{ cause }`
   * so the stack stays intact for debugging without re-stringifying
   * internals.
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
      return new LlmRetriableError(`anthropic ${status}: ${baseMessage}`, { cause: err });
    }
    if (typeof status === 'number') {
      return new Error(`anthropic ${status}: ${baseMessage}`, { cause: err });
    }
    return new LlmRetriableError(`anthropic network error: ${baseMessage}`, { cause: err });
  }
}

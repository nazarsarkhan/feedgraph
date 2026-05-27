import { AnthropicAdapter } from './anthropic.adapter';
import { LlmRetriableError } from './llm-retriable-error';

// classifyError is private; cast through `unknown` so the intersection
// doesn't reduce to `never` against the private member. Mirrors the OpenAI
// adapter test — same matrix of statuses so the failover policy stays
// uniform across providers.
interface AdapterWithPrivate {
  classifyError(err: unknown): Error;
}

describe('AnthropicAdapter.classifyError', () => {
  let adapter: AdapterWithPrivate;

  beforeEach(() => {
    adapter = new AnthropicAdapter(
      'fake-key',
      'claude-haiku-4-5-20251001',
    ) as unknown as AdapterWithPrivate;
  });

  it('classifies 429 as retriable (rate limit)', () => {
    const err = Object.assign(new Error('rate limit'), { status: 429 });
    expect(adapter.classifyError(err)).toBeInstanceOf(LlmRetriableError);
  });

  it('classifies 500 as retriable (server error)', () => {
    const err = Object.assign(new Error('server error'), { status: 500 });
    expect(adapter.classifyError(err)).toBeInstanceOf(LlmRetriableError);
  });

  it('classifies 503 as retriable (unavailable)', () => {
    const err = Object.assign(new Error('unavailable'), { status: 503 });
    expect(adapter.classifyError(err)).toBeInstanceOf(LlmRetriableError);
  });

  it('classifies 401 as retriable (independent credentials per provider)', () => {
    const err = Object.assign(new Error('unauthorized'), { status: 401 });
    expect(adapter.classifyError(err)).toBeInstanceOf(LlmRetriableError);
  });

  it('classifies 403 as retriable', () => {
    const err = Object.assign(new Error('forbidden'), { status: 403 });
    expect(adapter.classifyError(err)).toBeInstanceOf(LlmRetriableError);
  });

  it('classifies 400 as NON-retriable', () => {
    const err = Object.assign(new Error('bad request'), { status: 400 });
    const result = adapter.classifyError(err);
    expect(result).not.toBeInstanceOf(LlmRetriableError);
    expect(result).toBeInstanceOf(Error);
  });

  it('classifies 422 as NON-retriable', () => {
    const err = Object.assign(new Error('unprocessable'), { status: 422 });
    expect(adapter.classifyError(err)).not.toBeInstanceOf(LlmRetriableError);
  });

  it('classifies 404 as NON-retriable', () => {
    const err = Object.assign(new Error('not found'), { status: 404 });
    expect(adapter.classifyError(err)).not.toBeInstanceOf(LlmRetriableError);
  });

  it('classifies network error (no status) as retriable', () => {
    const err = new Error('ECONNRESET');
    expect(adapter.classifyError(err)).toBeInstanceOf(LlmRetriableError);
  });

  it('attaches the original error via cause for debuggability', () => {
    const original = Object.assign(new Error('rate limit'), { status: 429 });
    const result = adapter.classifyError(original);
    expect((result as Error & { cause?: unknown }).cause).toBe(original);
  });
});

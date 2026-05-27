/**
 * Signals an error that warrants a failover attempt: 5xx, 429, network
 * timeouts, or schema-validation failures that suggest the primary is in
 * a bad state. Adapters classify their own errors and throw this when
 * appropriate; LlmService catches it specifically to decide failover.
 *
 * Plain Error is reserved for non-retriable failures (auth, malformed
 * request, code bugs) — failover would just hit the same wall on the
 * secondary, so we propagate instead.
 */
export class LlmRetriableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LlmRetriableError';
  }
}

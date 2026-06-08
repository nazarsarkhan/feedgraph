export type RunMode = 'all' | 'api' | 'worker';

/**
 * Resolve the process role from the RUN_MODE env var.
 *
 * Read straight from `process.env` (not ConfigService) on purpose: module
 * provider arrays and `@Processor` decorator options are evaluated at
 * module-load time, before Nest's DI container and ConfigService exist — the
 * same reason the per-worker concurrency constants read `process.env`
 * directly. `env.schema` still validates RUN_MODE at boot, so an invalid value
 * fails fast a moment later; the fallback to 'all' here only covers the unset
 * case (a single-container deploy that runs everything in one process).
 *
 * - 'all'    — HTTP + scheduler + queue processors in one process (default).
 * - 'api'    — HTTP + the in-process cron scheduler only; no queue processors.
 * - 'worker' — BullMQ queue processors only; no HTTP server, no scheduler.
 */
export function getRunMode(): RunMode {
  const raw = process.env.RUN_MODE;
  return raw === 'api' || raw === 'worker' ? raw : 'all';
}

/** 'api' and 'all' serve HTTP and run the in-process cron scheduler. */
export function isApiMode(mode: RunMode = getRunMode()): boolean {
  return mode === 'api' || mode === 'all';
}

/** 'worker' and 'all' run the BullMQ queue processors. */
export function isWorkerMode(mode: RunMode = getRunMode()): boolean {
  return mode === 'worker' || mode === 'all';
}

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { isApiMode } from '../config/run-mode';
import { RedisService } from '../redis/redis.service';

// Channel carrying feed-poll lifecycle events. Namespaced so it can't collide
// with BullMQ's own Redis keys (BullMQ prefixes everything with `bull:`).
const POLL_STATUS_CHANNEL = 'feedgraph:feed-poll-status';

/**
 * A single feed-poll lifecycle event, published when a poll finishes (or
 * fails) and consumed by the SSE endpoint so the browser can refresh the
 * moment the worker is done instead of guessing with a fixed delay.
 */
export interface FeedPollEvent {
  feedId: string;
  userId: string;
  status: 'polled' | 'error';
  inserted?: number;
  skipped?: number;
  error?: string;
}

/**
 * Cross-process event bridge for feed-poll status.
 *
 * The worker and the API run as separate processes once RUN_MODE splits them,
 * so an in-process EventEmitter would never reach the API process that holds
 * the SSE connection. Instead the worker PUBLISHes each event to a Redis
 * channel and the API process SUBSCRIBEs and re-emits it onto an in-process
 * RxJS Subject that the `@Sse` endpoint observes. In RUN_MODE=all both halves
 * live in one process and the round-trip is a Redis loopback — same code path,
 * no special case.
 *
 * A subscriber connection in ioredis enters "subscriber mode" and can't issue
 * normal commands, so we `.duplicate()` a dedicated connection for it and keep
 * publishing on the shared client.
 */
@Injectable()
export class FeedEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedEventsService.name);
  private readonly events$ = new Subject<FeedPollEvent>();
  private subscriber?: Redis;

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    // Only the API/all process holds SSE connections, so only it subscribes.
    // A pure worker has no HTTP stream to feed and skips the subscription.
    if (!isApiMode()) return;

    const subscriber = this.redis.getClient().duplicate();
    this.subscriber = subscriber;
    subscriber.on('message', (channel, message) => {
      if (channel !== POLL_STATUS_CHANNEL) return;
      try {
        this.events$.next(JSON.parse(message) as FeedPollEvent);
      } catch {
        this.logger.warn(`dropping malformed feed-poll event: ${message}`);
      }
    });
    void subscriber.subscribe(POLL_STATUS_CHANNEL).catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`failed to subscribe to ${POLL_STATUS_CHANNEL}: ${reason}`);
    });
  }

  /**
   * Publish a poll event. Runs on the worker/all side via the shared client
   * (PUBLISH is a normal command, so it doesn't need the subscriber socket).
   */
  async publish(event: FeedPollEvent): Promise<void> {
    await this.redis.getClient().publish(POLL_STATUS_CHANNEL, JSON.stringify(event));
  }

  /** Stream of poll events for a single feed, for the SSE endpoint. */
  streamForFeed(feedId: string): Observable<FeedPollEvent> {
    return this.events$.asObservable().pipe(filter((event) => event.feedId === feedId));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    this.events$.complete();
  }
}

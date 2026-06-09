export const QUEUE_NAMES = {
  FEED_POLL: 'feed-poll',
  ARTICLE_PREFILTER: 'article-prefilter',
  ARTICLE_PROCESS: 'article-process',
  // On-demand fuzzy entity deduplication. One job per user, enqueued by
  // POST /entities/deduplicate; the worker walks the user's entity set in
  // batches, calling matchEntities + merging per batch. See entity-dedup.*
  ENTITY_DEDUP: 'entity-dedup',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

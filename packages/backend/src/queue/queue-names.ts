export const QUEUE_NAMES = {
  FEED_POLL: 'feed-poll',
  ARTICLE_PREFILTER: 'article-prefilter',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

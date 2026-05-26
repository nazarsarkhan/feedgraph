export const QUEUE_NAMES = {
  FEED_POLL: 'feed-poll',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

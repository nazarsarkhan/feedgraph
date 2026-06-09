import type { RedisService } from '../redis/redis.service';
import { FeedEventsService, type FeedPollEvent } from './feed-events.service';

const CHANNEL = 'feedgraph:feed-poll-status';

// Minimal ioredis stand-in for the duplicated subscriber connection: captures
// the 'message' handler so the test can drive inbound pub/sub messages.
class FakeSubscriber {
  messageHandler?: (channel: string, message: string) => void;
  on = jest.fn((event: string, cb: (channel: string, message: string) => void) => {
    if (event === 'message') this.messageHandler = cb;
    return this;
  });
  subscribe = jest.fn().mockResolvedValue(1);
  quit = jest.fn().mockResolvedValue('OK');
  deliver(channel: string, message: string): void {
    this.messageHandler?.(channel, message);
  }
}

function makeRedis(subscriber: FakeSubscriber) {
  const publish = jest.fn().mockResolvedValue(1);
  const client = { publish, duplicate: jest.fn(() => subscriber) };
  const service = { getClient: () => client } as unknown as RedisService;
  return { service, publish, client };
}

describe('FeedEventsService', () => {
  const originalMode = process.env.RUN_MODE;
  let subscriber: FakeSubscriber;

  beforeEach(() => {
    subscriber = new FakeSubscriber();
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.RUN_MODE;
    else process.env.RUN_MODE = originalMode;
  });

  it('subscribes to the poll-status channel in api/all mode', () => {
    process.env.RUN_MODE = 'api';
    const { service: redis, client } = makeRedis(subscriber);
    const events = new FeedEventsService(redis);

    events.onModuleInit();

    expect(client.duplicate).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledWith(CHANNEL);
  });

  it('does NOT subscribe in worker mode (no SSE consumers there)', () => {
    process.env.RUN_MODE = 'worker';
    const { service: redis, client } = makeRedis(subscriber);
    const events = new FeedEventsService(redis);

    events.onModuleInit();

    expect(client.duplicate).not.toHaveBeenCalled();
    expect(subscriber.subscribe).not.toHaveBeenCalled();
  });

  it('publishes a JSON-encoded event on the shared client', async () => {
    process.env.RUN_MODE = 'worker';
    const { service: redis, publish } = makeRedis(subscriber);
    const events = new FeedEventsService(redis);

    const event: FeedPollEvent = {
      feedId: 'feed-1',
      userId: 'user-1',
      status: 'polled',
      inserted: 3,
      skipped: 1,
    };
    await events.publish(event);

    expect(publish).toHaveBeenCalledWith(CHANNEL, JSON.stringify(event));
  });

  it('forwards an inbound message only to the matching feed stream', () => {
    process.env.RUN_MODE = 'api';
    const { service: redis } = makeRedis(subscriber);
    const events = new FeedEventsService(redis);
    events.onModuleInit();

    const received: FeedPollEvent[] = [];
    events.streamForFeed('feed-1').subscribe((e) => received.push(e));

    subscriber.deliver(
      CHANNEL,
      JSON.stringify({ feedId: 'feed-2', userId: 'u', status: 'polled' }),
    );
    subscriber.deliver(
      CHANNEL,
      JSON.stringify({ feedId: 'feed-1', userId: 'u', status: 'polled', inserted: 2 }),
    );

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ feedId: 'feed-1', status: 'polled', inserted: 2 });
  });

  it('drops a malformed payload without throwing or emitting', () => {
    process.env.RUN_MODE = 'api';
    const { service: redis } = makeRedis(subscriber);
    const events = new FeedEventsService(redis);
    events.onModuleInit();

    const received: FeedPollEvent[] = [];
    events.streamForFeed('feed-1').subscribe((e) => received.push(e));

    expect(() => subscriber.deliver(CHANNEL, 'not-json{')).not.toThrow();
    expect(received).toHaveLength(0);
  });

  it('ignores messages on an unrelated channel', () => {
    process.env.RUN_MODE = 'api';
    const { service: redis } = makeRedis(subscriber);
    const events = new FeedEventsService(redis);
    events.onModuleInit();

    const received: FeedPollEvent[] = [];
    events.streamForFeed('feed-1').subscribe((e) => received.push(e));

    subscriber.deliver(
      'some:other:channel',
      JSON.stringify({ feedId: 'feed-1', userId: 'u', status: 'polled' }),
    );

    expect(received).toHaveLength(0);
  });
});

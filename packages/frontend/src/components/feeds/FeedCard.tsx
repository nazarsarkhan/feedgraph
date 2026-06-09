import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FeedStatusBadge } from '@/components/feeds/FeedStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { feedsApi, type Feed, type FeedPollEvent } from '@/lib/feeds';

// Safety net: if no SSE event arrives (stream blocked, worker stuck), close the
// connection and refetch anyway so the card never hangs in the polling state.
const POLL_STREAM_TIMEOUT_MS = 30000;

interface Props {
  feed: Feed;
  onDeleteClick: (feed: Feed) => void;
}

export function FeedCard({ feed, onDeleteClick }: Props) {
  const queryClient = useQueryClient();
  const [streaming, setStreaming] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tear down any open stream when the card unmounts.
  useEffect(() => {
    return () => {
      sourceRef.current?.close();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const togglePause = useMutation<Feed, Error, void>({
    mutationFn: () =>
      feed.status === 'active' ? feedsApi.pause(feed.id) : feedsApi.resume(feed.id),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success(updated.status === 'active' ? 'Feed resumed' : 'Feed paused');
    },
  });

  // Close the SSE stream + clear the safety timer, then refetch ['feeds'] so
  // lastPolledAt and any freshly imported articles surface. Idempotent.
  const finishStream = () => {
    sourceRef.current?.close();
    sourceRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStreaming(false);
    void queryClient.invalidateQueries({ queryKey: ['feeds'] });
  };

  // Open an EventSource to the poll-status stream. The worker publishes a
  // 'polled'/'error' event the moment it finishes; we refresh on that event
  // instead of guessing with a fixed delay.
  const subscribeToPollStatus = () => {
    sourceRef.current?.close();
    setStreaming(true);
    const source = new EventSource(feedsApi.pollStatusUrl(feed.id), { withCredentials: true });
    sourceRef.current = source;

    source.onmessage = (evt) => {
      let event: FeedPollEvent;
      try {
        event = JSON.parse(evt.data) as FeedPollEvent;
      } catch {
        return;
      }
      if (event.status === 'polled') {
        toast.success('Feed polled', {
          description:
            typeof event.inserted === 'number'
              ? `${event.inserted} new article(s) imported.`
              : undefined,
        });
      } else if (event.status === 'error') {
        toast.error('Feed poll failed', { description: event.error });
      }
      finishStream();
    };

    // Connection failure (or a server-side stream error). Fall back to a single
    // refetch rather than leaving the connection trying to reconnect forever.
    source.onerror = () => finishStream();

    timeoutRef.current = setTimeout(finishStream, POLL_STREAM_TIMEOUT_MS);
  };

  const pollNow = useMutation<{ message: string; feedId: string }, Error, void>({
    mutationFn: () => feedsApi.pollNow(feed.id),
    onSuccess: () => {
      toast.success('Polling scheduled', {
        description: 'Waiting for the worker to finish…',
      });
      // Backend returns 202; the actual poll runs async on the BullMQ worker.
      // Subscribe to the SSE stream so we refresh the instant it completes.
      subscribeToPollStatus();
    },
  });

  const lastPolled = feed.lastPolledAt
    ? formatDistanceToNow(new Date(feed.lastPolledAt), { addSuffix: true })
    : 'Never polled';

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="truncate text-base font-semibold">{feed.name ?? feed.url}</div>
            <a
              href={feed.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-xs text-muted-foreground hover:underline"
              title={feed.url}
            >
              {feed.url}
            </a>
          </div>
          <FeedStatusBadge status={feed.status} />
        </div>

        <div className="text-sm text-muted-foreground">
          Last polled: <span title={feed.lastPolledAt ?? undefined}>{lastPolled}</span>
        </div>

        {feed.status === 'error' && feed.lastErrorMessage && (
          <div className="text-sm text-destructive">{feed.lastErrorMessage}</div>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={togglePause.isPending}
          onClick={() => togglePause.mutate()}
        >
          {feed.status === 'active' ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              Pause
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Resume
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pollNow.isPending || streaming || feed.status !== 'active'}
          onClick={() => pollNow.mutate()}
        >
          <RefreshCw className={`h-3.5 w-3.5${streaming ? ' animate-spin' : ''}`} />
          {streaming ? 'Polling…' : 'Poll now'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDeleteClick(feed)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}

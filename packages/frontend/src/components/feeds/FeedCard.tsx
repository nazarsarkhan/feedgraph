import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FeedStatusBadge } from '@/components/feeds/FeedStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { feedsApi, type Feed } from '@/lib/feeds';

const POLL_REFETCH_DELAY_MS = 8000;

interface Props {
  feed: Feed;
  onDeleteClick: (feed: Feed) => void;
}

export function FeedCard({ feed, onDeleteClick }: Props) {
  const queryClient = useQueryClient();

  const togglePause = useMutation<Feed, Error, void>({
    mutationFn: () =>
      feed.status === 'active' ? feedsApi.pause(feed.id) : feedsApi.resume(feed.id),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success(updated.status === 'active' ? 'Feed resumed' : 'Feed paused');
    },
  });

  const pollNow = useMutation<{ message: string; feedId: string }, Error, void>({
    mutationFn: () => feedsApi.pollNow(feed.id),
    onSuccess: () => {
      toast.success('Polling scheduled', {
        description: 'Refreshing list in a few seconds.',
      });
      // Backend returns 202; the actual poll runs async on the BullMQ worker.
      // Refetch after a reasonable delay to surface new lastPolledAt + any
      // freshly imported articles. SSE / websocket is tracked as tech debt.
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['feeds'] });
      }, POLL_REFETCH_DELAY_MS);
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
          disabled={pollNow.isPending || feed.status !== 'active'}
          onClick={() => pollNow.mutate()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Poll now
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

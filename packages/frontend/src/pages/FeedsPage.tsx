import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AddFeedDialog } from '@/components/feeds/AddFeedDialog';
import { DeleteFeedDialog } from '@/components/feeds/DeleteFeedDialog';
import { FeedCard } from '@/components/feeds/FeedCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFeeds } from '@/hooks/useFeeds';
import type { Feed } from '@/lib/feeds';

export function FeedsPage() {
  const feeds = useFeeds();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Feed | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Feeds</h1>
          <p className="text-sm text-muted-foreground">
            RSS and Atom sources you subscribe to. Polled on a schedule and on demand.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add feed
        </Button>
      </div>

      {feeds.isLoading && <SkeletonList />}

      {feeds.error && (
        <Card>
          <CardHeader>
            <CardTitle>Could not load feeds</CardTitle>
            <CardDescription>{feeds.error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => feeds.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {feeds.data && feeds.data.length === 0 && (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>No feeds yet</CardTitle>
            <CardDescription>
              Add your first RSS source to start ingesting articles.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add your first feed
            </Button>
          </CardContent>
        </Card>
      )}

      {feeds.data && feeds.data.length > 0 && (
        <div className="flex flex-col gap-4">
          {feeds.data.map((feed) => (
            <FeedCard key={feed.id} feed={feed} onDeleteClick={setDeleteTarget} />
          ))}
        </div>
      )}

      <AddFeedDialog open={addOpen} onOpenChange={setAddOpen} />
      <DeleteFeedDialog feed={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="pt-6 space-y-3">
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

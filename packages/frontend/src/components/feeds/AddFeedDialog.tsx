import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiException } from '@/lib/api';
import { feedsApi, type Feed } from '@/lib/feeds';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddFeedDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  const create = useMutation<Feed, ApiException, { url: string; name?: string }>({
    mutationFn: feedsApi.create,
    onSuccess: async (feed) => {
      await queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success(`Added ${feed.name ?? feed.url}`);
      onOpenChange(false);
    },
  });

  const { reset: resetMutation } = create;

  // Reset form whenever the dialog closes — preserves state during retries
  // (open + error) but clears it on a fresh open or a confirmed success.
  // `resetMutation` is stable per useMutation's contract.
  useEffect(() => {
    if (!open) {
      setUrl('');
      setName('');
      resetMutation();
    }
  }, [open, resetMutation]);

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    create.mutate({ url, name: name.trim() ? name.trim() : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a feed</DialogTitle>
          <DialogDescription>
            Paste an RSS or Atom URL. We validate it live before saving.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feed-url">Feed URL</Label>
            <Input
              id="feed-url"
              type="url"
              placeholder="https://example.com/feed.xml"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="feed-name">
              Name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="feed-name"
              type="text"
              placeholder="Defaults to the feed's own title"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {create.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {create.error.message}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add feed'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

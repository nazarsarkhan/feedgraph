import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { ApiException } from '@/lib/api';
import { feedsApi, type Feed } from '@/lib/feeds';
import { cn } from '@/lib/utils';

interface Props {
  feed: Feed | null;
  onClose: () => void;
}

export function DeleteFeedDialog({ feed, onClose }: Props) {
  const queryClient = useQueryClient();

  const remove = useMutation<void, ApiException, string>({
    mutationFn: feedsApi.remove,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['feeds'] });
      toast.success('Feed deleted');
      onClose();
    },
  });

  const { reset: resetMutation } = remove;
  const feedId = feed?.id;

  // Clear stale error when the user reopens with a different feed.
  // `resetMutation` is stable per useMutation's contract.
  useEffect(() => {
    if (feedId) resetMutation();
  }, [feedId, resetMutation]);

  const open = feed !== null;
  const onConfirm = (e: React.MouseEvent<HTMLButtonElement>): void => {
    // Prevent Radix's default close-on-action; we close ourselves after the
    // mutation settles so an error keeps the dialog open with the message.
    e.preventDefault();
    if (feed) remove.mutate(feed.id);
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this feed?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove <strong>{feed?.name ?? feed?.url ?? ''}</strong> from your
            subscriptions. Articles already imported from it will remain but lose their source link.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {remove.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {remove.error.message}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            onClick={onConfirm}
            className={cn(buttonVariants({ variant: 'destructive' }))}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

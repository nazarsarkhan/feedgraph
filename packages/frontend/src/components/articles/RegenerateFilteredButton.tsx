import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiException } from '@/lib/api';
import { articlesApi, type ArticleFilters, type RegenerateFilters } from '@/lib/articles';
import { cn } from '@/lib/utils';

interface Props {
  filters: ArticleFilters;
}

type RegenerateResult = { reset: number; enqueued: number };

// Pull only the fields the regenerate endpoint accepts out of the list
// filters. `status`, `page`, `pageSize` and sort are deliberately dropped —
// regenerate forces status='processed' server-side and isn't paginated.
function toRegenerateFilters(f: ArticleFilters): RegenerateFilters {
  return {
    q: f.q,
    category: f.category,
    feedId: f.feedId,
    importance: f.importance,
    from: f.from,
    to: f.to,
  };
}

/**
 * "Reclassify filtered" affordance for the articles list. Only renders when
 * at least one regenerate-relevant filter is active (the bulk all-articles
 * reset lives in Settings). Resets the matching processed articles to
 * pending_llm so the workers re-classify exactly that slice — the power-user
 * answer to "I tweaked one axis, only re-run the affected articles".
 */
export function RegenerateFilteredButton({ filters }: Props) {
  const queryClient = useQueryClient();
  const body = toRegenerateFilters(filters);

  // status-only / sort-only filtering doesn't narrow the regenerate set, so
  // the button only appears when a field the endpoint actually honours is set.
  const hasRegenerableFilter = Object.values(body).some((v) => v !== undefined && v !== '');

  const regenerate = useMutation<RegenerateResult, ApiException, void>({
    mutationFn: () => articlesApi.regenerate(body),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast.success(
        data.reset > 0
          ? `Reset ${data.reset} matching article${data.reset === 1 ? '' : 's'}, enqueued ${data.enqueued}.`
          : 'No matching processed articles to reclassify.',
      );
    },
  });

  if (!hasRegenerableFilter) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={regenerate.isPending}>
          <RefreshCw className={cn('h-4 w-4', regenerate.isPending && 'animate-spin')} />
          Reclassify filtered
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reclassify the filtered articles?</AlertDialogTitle>
          <AlertDialogDescription>
            Every <strong>processed</strong> article matching the current filters will be reset to
            pending and re-analysed by the LLM. Use this after changing an axis or category. This
            may take a few minutes.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {regenerate.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {regenerate.error.message}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={regenerate.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={regenerate.isPending}
            onClick={(e) => {
              // Keep the dialog open until the mutation settles so an error
              // surfaces in place instead of vanishing with the dialog.
              e.preventDefault();
              regenerate.mutate();
            }}
            className={cn(buttonVariants({ variant: 'default' }))}
          >
            {regenerate.isPending ? 'Reclassifying…' : 'Reclassify'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

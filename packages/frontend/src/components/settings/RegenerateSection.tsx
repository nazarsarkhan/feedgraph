import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  usePendingLlmArticleCount,
  useProcessedArticleCount,
} from '@/hooks/useProcessedArticleCount';
import { ApiException } from '@/lib/api';
import { articlesApi } from '@/lib/articles';

type RegenerateResult = { reset: number; enqueued: number };

export function RegenerateSection() {
  const queryClient = useQueryClient();
  const processedQuery = useProcessedArticleCount();
  const pendingQuery = usePendingLlmArticleCount();
  const [confirming, setConfirming] = useState(false);

  const regenerate = useMutation<RegenerateResult, ApiException, void>({
    // No filter body → resets ALL processed articles (the bulk path).
    mutationFn: () => articlesApi.regenerate(),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      const msg =
        data.reset > 0
          ? `Reset ${data.reset} articles, enqueued ${data.enqueued} for reprocessing.`
          : data.enqueued > 0
            ? `Enqueued ${data.enqueued} pending articles for reprocessing.`
            : 'Nothing to reprocess.';
      toast.success(msg);
      setConfirming(false);
    },
    onError: () => {
      setConfirming(false);
    },
  });

  const isPending = processedQuery.isPending || pendingQuery.isPending;
  const error = processedQuery.error ?? pendingQuery.error;
  const processedCount = processedQuery.data ?? 0;
  const stuckCount = pendingQuery.data ?? 0;
  const totalWork = processedCount + stuckCount;
  const noneToDo = !isPending && !error && totalWork === 0;

  const description = (() => {
    if (isPending) return 'Counting articles…';
    if (error) return `Could not load article count: ${error.message}`;
    if (noneToDo) return 'No articles to reprocess.';
    const parts: string[] = [];
    if (processedCount > 0) parts.push(`${processedCount} processed`);
    if (stuckCount > 0) parts.push(`${stuckCount} pending`);
    return (
      `Re-enqueue ${parts.join(' + ')} article${totalWork === 1 ? '' : 's'} ` +
      `for LLM analysis. Use this after changing axes or adding categories. ` +
      `This may take several minutes.`
    );
  })();

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Reclassify articles
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!confirming && (
          <Button
            variant="destructive"
            disabled={isPending || regenerate.isPending || noneToDo}
            onClick={() => setConfirming(true)}
          >
            Reclassify articles
          </Button>
        )}

        {confirming && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              Are you sure? This will re-enqueue {totalWork} article
              {totalWork === 1 ? '' : 's'} (reset {processedCount} processed + {stuckCount}{' '}
              pending).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={regenerate.isPending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={regenerate.isPending}
                onClick={() => regenerate.mutate()}
              >
                Yes, reset all
              </Button>
            </div>
          </div>
        )}

        {regenerate.error && (
          <p className="mt-3 text-sm text-destructive">{regenerate.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}

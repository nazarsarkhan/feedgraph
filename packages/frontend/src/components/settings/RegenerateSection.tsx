import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProcessedArticleCount } from '@/hooks/useProcessedArticleCount';
import { ApiException } from '@/lib/api';
import { articlesApi } from '@/lib/articles';

export function RegenerateSection() {
  const queryClient = useQueryClient();
  const { data: count, isPending, error } = useProcessedArticleCount();
  const [confirming, setConfirming] = useState(false);

  const regenerate = useMutation<{ reset: number }, ApiException, void>({
    mutationFn: articlesApi.regenerate,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      toast.success(`Reset ${data.reset} articles. They will be reclassified shortly.`);
      setConfirming(false);
    },
    onError: () => {
      setConfirming(false);
    },
  });

  const displayCount = count ?? 0;
  const noneToReset = !isPending && !error && displayCount === 0;

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Reclassify articles
        </CardTitle>
        <CardDescription>
          {isPending && 'Counting processed articles…'}
          {error && `Could not load article count: ${error.message}`}
          {!isPending &&
            !error &&
            (noneToReset
              ? 'No processed articles to reclassify.'
              : `Reset all ${displayCount} processed articles to pending and rerun LLM classification. Use this after changing axes or adding categories. This may take several minutes.`)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!confirming && (
          <Button
            variant="destructive"
            disabled={isPending || regenerate.isPending || noneToReset}
            onClick={() => setConfirming(true)}
          >
            Reclassify articles
          </Button>
        )}

        {confirming && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              Are you sure? This will reset {displayCount} article{displayCount === 1 ? '' : 's'}.
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

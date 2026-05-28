import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiException } from '@/lib/api';
import { entitiesApi, type DeduplicateResult } from '@/lib/entities';

export function DeduplicateSection() {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const dedup = useMutation<DeduplicateResult, ApiException, void>({
    mutationFn: entitiesApi.deduplicate,
    onSuccess: async (data) => {
      // Invalidate every list that depends on the entity set so the
      // graph + entities list refresh after merges land. We don't
      // narrow further (e.g. specific filter keys) because the dedup
      // can affect any of them, and the cost of broad invalidation
      // is cheap compared to the LLM round-trip we just paid for.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entities'] }),
        queryClient.invalidateQueries({ queryKey: ['graph'] }),
      ]);
      if (data.groupsFound === 0) {
        toast.success(`No duplicates found (analysed ${data.entitiesConsidered} entities).`);
      } else {
        toast.success(
          `Merged ${data.entitiesMerged} duplicate entit${
            data.entitiesMerged === 1 ? 'y' : 'ies'
          } into ${data.groupsFound} group${data.groupsFound === 1 ? '' : 's'}.`,
        );
      }
      setConfirming(false);
    },
    onError: () => {
      setConfirming(false);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Entity deduplication
        </CardTitle>
        <CardDescription>
          Merge duplicate entities using AI fuzzy matching — catches surface-form variants like
          unicode dashes ("GPT-4o" vs "GPT&#8209;4o"), legal suffixes ("Microsoft" vs "Microsoft
          Corp."), and spacing ("OpenAI" vs "Open AI"). Re-pointed article links are preserved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!confirming && (
          <Button variant="outline" disabled={dedup.isPending} onClick={() => setConfirming(true)}>
            Deduplicate entities
          </Button>
        )}

        {confirming && (
          <div className="space-y-3">
            <p className="text-sm">
              This makes one LLM call sized to your current entity count. Merges are written in a
              single transaction — the graph will update automatically when it completes.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={dedup.isPending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button disabled={dedup.isPending} onClick={() => dedup.mutate()}>
                {dedup.isPending ? 'Running…' : 'Yes, deduplicate'}
              </Button>
            </div>
          </div>
        )}

        {dedup.error && <p className="mt-3 text-sm text-destructive">{dedup.error.message}</p>}
      </CardContent>
    </Card>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiException } from '@/lib/api';
import {
  dedupResultMessage,
  entitiesApi,
  isDedupJobSettled,
  type DedupJobStatus,
} from '@/lib/entities';

const POLL_INTERVAL_MS = 1500;

export function DeduplicateSection() {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  // Guards the settle effect so the success/failure toast + invalidation fire
  // exactly once per job, even though the poll may re-render with the same
  // settled data several times before we tear the query down.
  const handledJobRef = useRef<string | null>(null);

  const enqueue = useMutation<{ jobId: string }, ApiException, void>({
    mutationFn: entitiesApi.deduplicate,
    onSuccess: (data) => {
      handledJobRef.current = null;
      setJobId(data.jobId);
    },
    onError: () => {
      setConfirming(false);
    },
  });

  const statusQuery = useQuery<DedupJobStatus, ApiException>({
    queryKey: ['dedup-status', jobId],
    queryFn: () => entitiesApi.dedupStatus(jobId as string),
    enabled: jobId !== null,
    // Poll until the job settles, then stop. TanStack passes the live query;
    // returning false halts the interval.
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state && isDedupJobSettled(state)) return false;
      return POLL_INTERVAL_MS;
    },
  });

  const status = statusQuery.data;

  useEffect(() => {
    if (!jobId || !status) return;
    if (!isDedupJobSettled(status.state)) return;
    if (handledJobRef.current === jobId) return;
    handledJobRef.current = jobId;

    if (status.state === 'completed' && status.result) {
      // Invalidate every list that depends on the entity set so the graph +
      // entities list refresh after merges land. Broad invalidation is cheap
      // next to the LLM work we just paid for.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entities'] }),
        queryClient.invalidateQueries({ queryKey: ['graph'] }),
      ]);
      toast.success(dedupResultMessage(status.result));
    } else {
      toast.error(status.error ?? 'Entity deduplication failed.');
    }

    setJobId(null);
    setConfirming(false);
  }, [jobId, status, queryClient]);

  const isRunning =
    enqueue.isPending || (jobId !== null && (!status || !isDedupJobSettled(status.state)));

  const progress = status?.progress ?? null;
  const pct =
    progress && progress.totalEntities > 0
      ? Math.round((progress.processedEntities / progress.totalEntities) * 100)
      : 0;

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
        {!confirming && !isRunning && (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Deduplicate entities
          </Button>
        )}

        {confirming && !isRunning && (
          <div className="space-y-3">
            <p className="text-sm">
              This runs in the background, walking your entity set in batches — one LLM call per
              batch. The graph and entity list refresh automatically when it completes.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button onClick={() => enqueue.mutate()}>Yes, deduplicate</Button>
            </div>
          </div>
        )}

        {isRunning && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {progress
                  ? `Analysing entities — batch ${Math.min(
                      progress.batchesDone + 1,
                      progress.totalBatches,
                    )} of ${progress.totalBatches}`
                  : 'Starting deduplication…'}
              </span>
              {progress && progress.totalEntities > 0 && (
                <span className="tabular-nums text-muted-foreground">
                  {progress.processedEntities} / {progress.totalEntities}
                </span>
              )}
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            {progress && progress.entitiesMerged > 0 && (
              <p className="text-sm text-muted-foreground">
                Merged {progress.entitiesMerged} so far across {progress.groupsFound} group
                {progress.groupsFound === 1 ? '' : 's'}.
              </p>
            )}
          </div>
        )}

        {enqueue.error && <p className="mt-3 text-sm text-destructive">{enqueue.error.message}</p>}
      </CardContent>
    </Card>
  );
}

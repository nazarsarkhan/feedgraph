import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiException } from '@/lib/api';
import {
  digestsApi,
  isDigestJobSettled,
  type DigestItem,
  type DigestJobStatus,
  type DigestPeriodType,
  type GenerateDigestArgs,
  type GenerateDigestResponse,
} from '@/lib/digests';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POLL_INTERVAL_MS = 1500;

// Today as YYYY-MM-DD in the user's local timezone. The backend normalizes
// this against its own UTC bounds; local-today is just the natural default
// the user expects to see prefilled.
function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function digestReadyMessage(d: DigestItem): string {
  return (
    `Digest ready: ${d.periodType} of ${d.periodStart}` +
    ` — ${d.articleCount} article${d.articleCount === 1 ? '' : 's'}.`
  );
}

export function GenerateDigestDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [periodType, setPeriodType] = useState<DigestPeriodType>('day');
  const [date, setDate] = useState(todayLocalDate);
  const [jobId, setJobId] = useState<string | null>(null);
  // Async-job failure (e.g. an empty period) surfaced inline, mirroring how
  // the synchronous 400 was shown before generation moved to the worker.
  const [asyncError, setAsyncError] = useState<string | null>(null);
  // Guards the settle effect so the success/failure toast + invalidation fire
  // exactly once per job, even though the poll may re-render with the same
  // settled data several times before we tear the query down.
  const handledJobRef = useRef<string | null>(null);

  const generate = useMutation<GenerateDigestResponse, ApiException, GenerateDigestArgs>({
    mutationFn: digestsApi.generate,
    onSuccess: async (resp) => {
      if (resp.status === 'existing') {
        // Fast path — the digest already existed, no LLM, no spinner. Refresh
        // the list and close immediately.
        await queryClient.invalidateQueries({ queryKey: ['digests'] });
        toast.success(digestReadyMessage(resp.digest));
        onOpenChange(false);
        return;
      }
      // Enqueued — buildDigest runs on the worker. Poll the job to completion.
      setAsyncError(null);
      handledJobRef.current = null;
      setJobId(resp.jobId);
    },
  });

  const statusQuery = useQuery<DigestJobStatus, ApiException>({
    queryKey: ['digest-status', jobId],
    queryFn: () => digestsApi.generateStatus(jobId as string),
    enabled: jobId !== null,
    // Poll until the job settles, then stop. Returning false halts the interval.
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state && isDigestJobSettled(state)) return false;
      return POLL_INTERVAL_MS;
    },
  });

  const status = statusQuery.data;

  useEffect(() => {
    if (!jobId || !status) return;
    if (!isDigestJobSettled(status.state)) return;
    if (handledJobRef.current === jobId) return;
    handledJobRef.current = jobId;

    if (status.state === 'completed' && status.result) {
      void queryClient.invalidateQueries({ queryKey: ['digests'] });
      toast.success(digestReadyMessage(status.result));
      setJobId(null);
      onOpenChange(false);
    } else {
      const message = status.error ?? 'Digest generation failed.';
      setAsyncError(message);
      toast.error(message);
      setJobId(null);
    }
  }, [jobId, status, queryClient, onOpenChange]);

  const { reset: resetMutation } = generate;

  useEffect(() => {
    if (!open) {
      // Wipe form + job state when the dialog closes — same UX as AddFeedDialog.
      setPeriodType('day');
      setDate(todayLocalDate());
      setJobId(null);
      setAsyncError(null);
      handledJobRef.current = null;
      resetMutation();
    }
  }, [open, resetMutation]);

  // Generating spans the enqueue request AND the subsequent poll until settle.
  const isGenerating =
    generate.isPending || (jobId !== null && (!status || !isDigestJobSettled(status.state)));

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setAsyncError(null);
    generate.mutate({ periodType, date });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate digest</DialogTitle>
          <DialogDescription>
            Pick a period and any date within it. We synthesize a structured summary from your
            processed articles for that period. Re-running for the same period returns the cached
            digest instantly — no extra LLM cost.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="digest-period">Period</Label>
            <Select
              value={periodType}
              onValueChange={(v) => setPeriodType(v as DigestPeriodType)}
              disabled={isGenerating}
            >
              <SelectTrigger id="digest-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week (Mon–Sun)</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="digest-date">Date</Label>
            <Input
              id="digest-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isGenerating}
            />
            <p className="text-xs text-muted-foreground">
              Any date inside the desired period. We compute the calendar bounds automatically.
            </p>
          </div>

          {isGenerating && (
            <p className="text-sm text-muted-foreground" role="status">
              Generating digest in the background — this runs one LLM summary over the period's
              articles…
            </p>
          )}

          {(generate.error || asyncError) && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {generate.error?.message ?? asyncError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isGenerating}>
              {isGenerating ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiException } from '@/lib/api';
import { digestsApi, type DigestItem, type DigestPeriodType } from '@/lib/digests';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

export function GenerateDigestDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [periodType, setPeriodType] = useState<DigestPeriodType>('day');
  const [date, setDate] = useState(todayLocalDate);

  const generate = useMutation<
    DigestItem,
    ApiException,
    { periodType: DigestPeriodType; date: string }
  >({
    mutationFn: digestsApi.generate,
    onSuccess: async (digest) => {
      await queryClient.invalidateQueries({ queryKey: ['digests'] });
      // Idempotent generate — backend returns the existing row if a digest
      // already exists for this (user, period_type, period_start). The
      // toast is correct either way; we don't try to distinguish "new" vs
      // "reused" in the success message (cheap to overstate).
      toast.success(
        `Digest ready: ${digest.periodType} of ${digest.periodStart}` +
          ` — ${digest.articleCount} article${digest.articleCount === 1 ? '' : 's'}.`,
      );
      onOpenChange(false);
    },
  });

  const { reset: resetMutation } = generate;

  useEffect(() => {
    if (!open) {
      // Wipe form state when the dialog closes — same UX as AddFeedDialog.
      setPeriodType('day');
      setDate(todayLocalDate());
      resetMutation();
    }
  }, [open, resetMutation]);

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
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
            digest — no extra LLM cost.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="digest-period">Period</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as DigestPeriodType)}>
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
            />
            <p className="text-xs text-muted-foreground">
              Any date inside the desired period. We compute the calendar bounds automatically.
            </p>
          </div>

          {generate.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {generate.error.message}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={generate.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={generate.isPending}>
              {generate.isPending ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { MentionTimelineChart } from '@/components/entities/MentionTimelineChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTelemetryRecent, useTelemetrySummary } from '@/hooks/useTelemetry';
import type { TelemetryRecentRow } from '@/lib/telemetry';

export function TelemetryPage() {
  const queryClient = useQueryClient();
  const summary = useTelemetrySummary();
  const recent = useTelemetryRecent();

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
  };

  if (summary.isPending) return <LoadingState />;
  if (summary.error)
    return <ErrorCard message={summary.error.message} onRetry={() => summary.refetch()} />;

  const s = summary.data;
  // The token timeline arrives shaped as { date, tokens }; map to the
  // { date, count } shape that MentionTimelineChart + fillTimelineGaps share
  // so we don't carry a second chart component for the same job.
  const timelineData = s.tokenTimeline.map((p) => ({ date: p.date, count: p.tokens }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LLM Telemetry</h1>
          <p className="text-sm text-muted-foreground">
            Usage stats from the LLM pipeline. Only your own calls are shown.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total calls" value={s.totalCalls.toLocaleString()} />
        <StatCard label="Total tokens" value={s.totalTokens.toLocaleString()} />
        <StatCard
          label="Cache hit rate"
          value={`${(s.cacheHitRate * 100).toFixed(1)}%`}
          sub="tokens saved by cache"
        />
        <StatCard
          label="Success rate"
          value={`${(s.successRate * 100).toFixed(1)}%`}
          sub={
            s.failoverRate > 0 ? `${(s.failoverRate * 100).toFixed(1)}% used failover` : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token usage — last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          <MentionTimelineChart data={timelineData} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {s.byProvider.length === 0 && (
              <p className="text-sm text-muted-foreground">No calls yet.</p>
            )}
            {s.byProvider.map((p) => (
              <div key={p.provider} className="flex items-center justify-between py-1 text-sm">
                <span className="font-medium capitalize">{p.provider}</span>
                <div className="flex gap-4 text-muted-foreground">
                  <span>{p.calls.toLocaleString()} calls</span>
                  <span>{p.tokens.toLocaleString()} tokens</span>
                  <span>{(p.successRate * 100).toFixed(1)}% ok</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By operation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {s.byOperation.length === 0 && (
              <p className="text-sm text-muted-foreground">No calls yet.</p>
            )}
            {s.byOperation.map((op) => (
              <div key={op.operation} className="flex items-center justify-between py-1 text-sm">
                <span className="font-medium">{op.operation}</span>
                <div className="flex gap-4 text-muted-foreground">
                  <span>{op.calls.toLocaleString()} calls</span>
                  <span>{op.tokens.toLocaleString()} tokens</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent calls</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.data && recent.data.length > 0 ? (
            <RecentCallsTable rows={recent.data} />
          ) : (
            <p className="px-6 py-4 text-sm text-muted-foreground">No calls recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const GRID_COLS = 'grid-cols-[80px_140px_140px_80px_70px_60px_80px_1fr]';

function RecentCallsTable({ rows }: { rows: TelemetryRecentRow[] }) {
  return (
    <div className="overflow-hidden">
      <div
        className={`grid ${GRID_COLS} gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground`}
      >
        <span>Provider</span>
        <span>Model</span>
        <span>Operation</span>
        <span>Tokens</span>
        <span>Latency</span>
        <span>Cache</span>
        <span>Status</span>
        <span>Time</span>
      </div>
      {rows.map((row) => {
        const tokens = row.promptTokens + row.completionTokens;
        const statusLabel = row.success ? 'ok' : row.failoverFrom ? 'failover' : 'err';
        return (
          <div
            key={row.id}
            className={`grid ${GRID_COLS} gap-2 border-b px-4 py-2 text-xs last:border-0 hover:bg-accent/30`}
          >
            <span className="font-medium capitalize">{row.provider}</span>
            <span className="truncate text-muted-foreground" title={row.model}>
              {row.model}
            </span>
            <span className="text-muted-foreground">{row.operation}</span>
            <span>{tokens.toLocaleString()}</span>
            <span>{row.latencyMs}ms</span>
            <span>{row.cacheHit ? 'hit' : '—'}</span>
            <span className={row.success ? 'text-green-600' : 'text-destructive'}>
              {statusLabel}
            </span>
            <span className="text-muted-foreground" title={row.createdAt}>
              {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">LLM Telemetry</h1>
        <p className="text-sm text-muted-foreground">
          Usage stats from the LLM pipeline. Only your own calls are shown.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Couldn&apos;t load telemetry</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

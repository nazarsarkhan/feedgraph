import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardSummary } from '@/hooks/useDashboard';
import type { DashboardSummary, DashboardTopCategory, DashboardTopEntity } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
] as const;

const TRUNCATE_AXIS = 14;

// YYYY-MM-DD for "N days ago in UTC", matching the backend's
// expectation (calendar dates, not timestamps).
function isoDateNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DashboardPage() {
  const [days, setDays] = useState<number>(7);

  // Compute the period bounds outside useMemo so React Query's cache
  // key is stable string-for-string (object identity stability isn't
  // enough — the key is serialized).
  const fromDate = useMemo(() => isoDateNDaysAgo(days), [days]);
  const toDate = useMemo(() => todayIso(), [days]); // recompute on period change

  const { data, isPending, error, refetch } = useDashboardSummary(fromDate, toDate);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Top entities, categories, and article stats for the selected period.
          </p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <Button
              key={p.label}
              variant={days === p.days ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {isPending && <LoadingCard />}

      {error && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-destructive">{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {data && <DashboardContent data={data} />}
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardSummary }) {
  const noActivity = data.stats.totalArticles === 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total articles" value={data.stats.totalArticles.toLocaleString()} />
        <StatCard
          label="High importance"
          value={data.stats.highImportance.toLocaleString()}
          sub={`of ${data.stats.totalArticles.toLocaleString()} in period`}
        />
        <StatCard label="Filtered" value={data.stats.filtered.toLocaleString()} />
        <StatCard
          label="Top feed"
          value={data.topFeed?.name ?? '—'}
          sub={
            data.topFeed
              ? `${data.topFeed.articleCount.toLocaleString()} article${
                  data.topFeed.articleCount === 1 ? '' : 's'
                }`
              : 'no activity this period'
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top entities</CardTitle>
          <CardDescription>
            By article mention count. Click a bar to open the entity page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.topEntities.length === 0 ? (
            <EmptyHint noActivity={noActivity} />
          ) : (
            <TopEntitiesChart entities={data.topEntities} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top categories</CardTitle>
          <CardDescription>By count of articles classified into the category.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.topCategories.length === 0 ? (
            <EmptyHint noActivity={noActivity} />
          ) : (
            <TopCategoriesChart categories={data.topCategories} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function TopEntitiesChart({ entities }: { entities: DashboardTopEntity[] }) {
  const navigate = useNavigate();
  // recharts vertical-layout bars stack top-to-bottom in the order of
  // the data array — reverse so the longest bar lands at the top of
  // the chart instead of the bottom.
  const data = useMemo(() => [...entities].reverse(), [entities]);

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, entities.length * 28 + 40)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
        onClick={(e) => {
          // recharts hands a synthetic event-ish object; the clicked
          // datum is at activePayload[0].payload (typed loose because
          // recharts' click event isn't strongly typed in v3).
          const payload = (e as { activePayload?: Array<{ payload?: DashboardTopEntity }> })
            ?.activePayload?.[0]?.payload;
          if (payload?.id) navigate(`/entities/${payload.id}`);
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          dataKey="canonicalName"
          type="category"
          width={120}
          tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) =>
            v.length > TRUNCATE_AXIS ? `${v.slice(0, TRUNCATE_AXIS - 1)}…` : v
          }
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--accent) / 0.4)' }}
          contentStyle={{
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'hsl(var(--popover-foreground))',
          }}
          formatter={(value) => [String(value), 'mentions']}
        />
        <Bar
          dataKey="mentionCount"
          fill="hsl(var(--primary))"
          radius={[0, 3, 3, 0]}
          // cursor:pointer so the user knows the bar is clickable.
          style={{ cursor: 'pointer' }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopCategoriesChart({ categories }: { categories: DashboardTopCategory[] }) {
  const data = useMemo(() => [...categories].reverse(), [categories]);

  return (
    <ResponsiveContainer width="100%" height={Math.max(140, categories.length * 32 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          dataKey="name"
          type="category"
          width={140}
          tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) =>
            v.length > TRUNCATE_AXIS + 4 ? `${v.slice(0, TRUNCATE_AXIS + 3)}…` : v
          }
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--accent) / 0.4)' }}
          contentStyle={{
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'hsl(var(--popover-foreground))',
          }}
          formatter={(value) => [String(value), 'articles']}
        />
        <Bar
          dataKey="articleCount"
          fill="hsl(var(--primary))"
          radius={[0, 3, 3, 0]}
          fillOpacity={0.85}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', value === '—' && 'text-muted-foreground')}>
          {value}
        </div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyHint({ noActivity }: { noActivity: boolean }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">
      {noActivity
        ? 'No articles for this period yet — try a longer window.'
        : 'No data to chart for this period.'}
    </p>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        Loading dashboard…
      </CardContent>
    </Card>
  );
}

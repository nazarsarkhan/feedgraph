import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { fillTimelineGaps, type TimelinePoint } from '@/lib/timeline';

interface Props {
  data: TimelinePoint[];
}

export function MentionTimelineChart({ data }: Props) {
  const filled = useMemo(() => fillTimelineGaps(data), [data]);

  if (filled.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border bg-muted/20">
        <p className="text-sm text-muted-foreground">No mention data available.</p>
      </div>
    );
  }

  // Single-point entities: use linear so recharts renders a flat baseline
  // instead of trying to curve a single value.
  const isSinglePoint = filled.length === 1;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={filled} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="mentionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(d: string) => format(parseISO(d), 'MMM d')}
          interval={Math.max(0, Math.ceil(filled.length / 6) - 1)}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={28}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'hsl(var(--popover-foreground))',
          }}
          formatter={(value) => [String(value), 'mentions']}
          labelFormatter={(label) =>
            typeof label === 'string' ? format(parseISO(label), 'MMMM d, yyyy') : String(label)
          }
        />
        <Area
          type={isSinglePoint ? 'linear' : 'monotone'}
          dataKey="count"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#mentionFill)"
          dot={false}
          activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

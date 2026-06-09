import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { MinMentionsPills } from '@/components/entities/MinMentionsPills';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EntityType } from '@/lib/entities';
import type { GraphColorBy, GraphFilters } from '@/lib/graph';
import { getCategoryColor } from '@/lib/graph-layout';
import { cn } from '@/lib/utils';

const ALL = '__all__';
const SEARCH_DEBOUNCE_MS = 300;
// Time-window presets, in days. ALL clears the filter.
const DAYS_PRESETS: { value: string; label: string }[] = [
  { value: ALL, label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
];

interface Props {
  filters: GraphFilters;
  setFilter: <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]) => void;
  reset: () => void;
  activeFilterCount: number;
  entityCount: number;
  articleCount: number;
  edgeCount: number;
  // Distinct category names present in the current rendered graph,
  // used to draw the legend dots when colorBy === 'category'. Passed
  // in from GraphPage rather than re-derived here so the bar doesn't
  // need to know how to walk node data.
  categoriesInGraph: string[];
  // Timeline mode state lives on GraphPage (ephemeral UI mode, not
  // URL). The bar just renders a pill toggle that flips the parent's
  // state — same shape as the other On/Off pills, but the state
  // doesn't pass through the nuqs-backed filter hook.
  timelineActive: boolean;
  onTimelineToggle: () => void;
  // False when the dataset has no usable timestamps to scrub —
  // disables the toggle so the user can't activate an empty timeline.
  timelineAvailable: boolean;
}

const COLOR_BY_VALUES: ReadonlyArray<GraphColorBy> = ['type', 'category'];

export function GraphFilterBar({
  filters,
  setFilter,
  reset,
  activeFilterCount,
  entityCount,
  articleCount,
  edgeCount,
  categoriesInGraph,
  timelineActive,
  onTimelineToggle,
  timelineAvailable,
}: Props) {
  // Debounced local state for the search box, same pattern as the article /
  // entity filter bars: instant typing, throttled writes to the URL + query.
  const [qLocal, setQLocal] = useState(filters.q ?? '');
  useEffect(() => {
    setQLocal(filters.q ?? '');
  }, [filters.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qLocal !== (filters.q ?? '')) {
        setFilter('q', qLocal || undefined);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // Deps intentionally limited to qLocal — see EntityFilterBar for the
    // same debounce pattern and why filters.q / setFilter are excluded.
  }, [qLocal]);

  return (
    <div className="flex flex-wrap items-end gap-3 pb-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Type</span>
        <Select
          value={filters.type ?? ALL}
          onValueChange={(v) => setFilter('type', v === ALL ? undefined : (v as EntityType))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="person">Person</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="product">Product</SelectItem>
            <SelectItem value="technology">Technology</SelectItem>
            <SelectItem value="location">Location</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Search</span>
        <Input
          type="search"
          placeholder="Find entity…"
          className="w-[180px]"
          value={qLocal}
          onChange={(e) => setQLocal(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Min mentions</span>
        <MinMentionsPills
          value={filters.minMentions}
          onChange={(v) => setFilter('minMentions', v)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Time window</span>
        <Select
          value={filters.days ? String(filters.days) : ALL}
          onValueChange={(v) => setFilter('days', v === ALL ? undefined : Number(v))}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS_PRESETS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Color by</span>
        {/* Pair of pill buttons. The 'type' option passes `undefined`
            to setFilter so the default state lives in the URL as a
            missing param instead of `?colorBy=type` cruft. */}
        <div className="flex gap-1">
          {COLOR_BY_VALUES.map((v) => {
            const active = (filters.colorBy ?? 'type') === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter('colorBy', v === 'type' ? undefined : v)}
                className={cn(
                  'h-9 rounded-md border px-3 text-sm font-medium capitalize transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Articles</span>
        {/* Pill-style on/off toggle. We pass `undefined` (not `false`)
            when turning off so the nuqs filter hook clears the query
            param entirely instead of leaving `?includeArticles=false`
            in the URL. */}
        <button
          type="button"
          aria-pressed={!!filters.includeArticles}
          onClick={() => setFilter('includeArticles', filters.includeArticles ? undefined : true)}
          className={cn(
            'h-9 rounded-md border px-3 text-sm font-medium transition-colors',
            filters.includeArticles
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {filters.includeArticles ? 'On' : 'Off'}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Animate</span>
        {/* When on, co_mention edges paint with the react-flow dashed
            flow animation, source→target ordered by entity firstSeen
            (old → new). mentions edges (article→entity) stay static
            — they're already directional by nature and animating them
            would clutter the canvas with little extra signal. */}
        <button
          type="button"
          aria-pressed={!!filters.animate}
          onClick={() => setFilter('animate', filters.animate ? undefined : true)}
          className={cn(
            'h-9 rounded-md border px-3 text-sm font-medium transition-colors',
            filters.animate
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {filters.animate ? 'On' : 'Off'}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Timeline</span>
        {/* Pulls down the scrubber UI when on. State lives on
            GraphPage — see Props comment. Disabled (and styled
            muted) when the dataset has no usable timestamps. */}
        <button
          type="button"
          aria-pressed={timelineActive}
          onClick={onTimelineToggle}
          disabled={!timelineAvailable}
          className={cn(
            'h-9 rounded-md border px-3 text-sm font-medium transition-colors',
            timelineActive
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            !timelineAvailable && 'cursor-not-allowed opacity-50 hover:bg-background',
          )}
        >
          {timelineActive ? 'On' : 'Off'}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3 pb-0.5 text-sm text-muted-foreground">
        {activeFilterCount > 0 && (
          <>
            <span>
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} active
            </span>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </>
        )}
        <span>
          {entityCount} entit{entityCount === 1 ? 'y' : 'ies'}
          {articleCount > 0 && <> &middot; {articleCount} articles</>} &middot; {edgeCount}{' '}
          relationships
        </span>
      </div>

      {filters.colorBy === 'category' && categoriesInGraph.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
          <span className="text-muted-foreground">Legend:</span>
          {categoriesInGraph.map((cat) => {
            const color = getCategoryColor(cat);
            return (
              <span key={cat} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-border"
                  style={{ backgroundColor: color?.dot ?? '#94a3b8' }}
                />
                <span className="text-foreground/80">{cat}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

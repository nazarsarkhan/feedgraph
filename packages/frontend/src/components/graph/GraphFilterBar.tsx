import { X } from 'lucide-react';
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
import type { GraphFilters } from '@/lib/graph';
import { cn } from '@/lib/utils';

const ALL = '__all__';

interface Props {
  filters: GraphFilters;
  setFilter: <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]) => void;
  reset: () => void;
  activeFilterCount: number;
  entityCount: number;
  articleCount: number;
  edgeCount: number;
}

export function GraphFilterBar({
  filters,
  setFilter,
  reset,
  activeFilterCount,
  entityCount,
  articleCount,
  edgeCount,
}: Props) {
  const minMentionsValue =
    filters.minMentions !== undefined && filters.minMentions > 0 ? String(filters.minMentions) : '';

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
        <span className="text-xs font-medium text-muted-foreground">Min mentions</span>
        <Input
          type="number"
          min={1}
          placeholder="1+"
          className="w-[100px]"
          value={minMentionsValue}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            setFilter('minMentions', Number.isFinite(n) && n > 0 ? n : undefined);
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Articles</span>
        {/* Pill-style on/off toggle. We pass `undefined` (not `false`)
            when turning off so the generic useUrlFilters removes the
            query param entirely instead of leaving `?includeArticles=false`
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
    </div>
  );
}

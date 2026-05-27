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

const ALL = '__all__';

interface Props {
  filters: GraphFilters;
  setFilter: <K extends keyof GraphFilters>(key: K, value: GraphFilters[K]) => void;
  reset: () => void;
  activeFilterCount: number;
  nodeCount: number;
  edgeCount: number;
}

export function GraphFilterBar({
  filters,
  setFilter,
  reset,
  activeFilterCount,
  nodeCount,
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
          {nodeCount} entities &middot; {edgeCount} relationships
        </span>
      </div>
    </div>
  );
}

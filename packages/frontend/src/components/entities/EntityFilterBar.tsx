import { useEffect, useState } from 'react';
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
import type { EntityFilters, EntityType } from '@/lib/entities';

const ALL = '__all__';
const SEARCH_DEBOUNCE_MS = 300;

interface Props {
  filters: EntityFilters;
  setFilter: <K extends keyof EntityFilters>(key: K, value: EntityFilters[K]) => void;
  reset: () => void;
  activeFilterCount: number;
}

export function EntityFilterBar({ filters, setFilter, reset, activeFilterCount }: Props) {
  // Local state for the search box so every keystroke updates the input
  // immediately, but the filter (and the URL, and the network query) only
  // moves on the debounced edge.
  const [qLocal, setQLocal] = useState(filters.q ?? '');

  // Keep local state in sync if filters.q changes from outside (Clear all,
  // shared URL, sort-changes that don't touch q). This is the inbound half
  // of the two-way bind.
  useEffect(() => {
    setQLocal(filters.q ?? '');
  }, [filters.q]);

  // Debounced outbound half: 300ms after qLocal stops changing, push it up.
  // Deps deliberately exclude filters.q and setFilter — including filters.q
  // would re-arm the timer when the URL catches up (creating a feedback
  // loop), and setFilter's identity changes on every searchParams update.
  // The guard `qLocal !== (filters.q ?? '')` makes the effect idempotent
  // when it runs against a no-op edit.
  useEffect(() => {
    const t = setTimeout(() => {
      if (qLocal !== (filters.q ?? '')) {
        setFilter('q', qLocal || undefined);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [qLocal]);

  const onMinMentions = (raw: string): void => {
    const n = Number(raw);
    setFilter('minMentions', Number.isFinite(n) && n > 0 ? n : undefined);
  };

  const minMentionsValue =
    filters.minMentions !== undefined && filters.minMentions > 0 ? String(filters.minMentions) : '';

  return (
    <div className="sticky top-14 z-10 -mx-8 border-b bg-background px-8 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="Type">
          <Select
            value={filters.type ?? ALL}
            onValueChange={(v) => setFilter('type', v === ALL ? undefined : (v as EntityType))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="person">Person</SelectItem>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="technology">Technology</SelectItem>
              <SelectItem value="location">Location</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Search">
          <Input
            type="text"
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            placeholder="Search by name…"
            className="w-[220px]"
          />
        </FilterField>

        <FilterField label="Min mentions">
          <Input
            type="number"
            min={1}
            value={minMentionsValue}
            onChange={(e) => onMinMentions(e.target.value)}
            placeholder="1+"
            className="w-[100px]"
          />
        </FilterField>

        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          {activeFilterCount > 0 && (
            <>
              <span>
                {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} active
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-3.5 w-3.5" />
                Clear all
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

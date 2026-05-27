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
import { useCategories } from '@/hooks/useCategories';
import { useFeeds } from '@/hooks/useFeeds';
import type { ArticleFilters, ArticleImportance, ArticleStatus } from '@/lib/articles';

const ALL = '__all__';

interface Props {
  filters: ArticleFilters;
  setFilter: <K extends keyof ArticleFilters>(key: K, value: ArticleFilters[K]) => void;
  reset: () => void;
  activeFilterCount: number;
}

export function ArticleFilterBar({ filters, setFilter, reset, activeFilterCount }: Props) {
  const feeds = useFeeds();
  const categories = useCategories();

  return (
    <div className="sticky top-14 z-10 -mx-8 border-b bg-background px-8 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="Status">
          <Select
            value={filters.status ?? ALL}
            onValueChange={(v) => setFilter('status', v === ALL ? undefined : (v as ArticleStatus))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="filtered">Filtered</SelectItem>
              <SelectItem value="pending_llm">Pending</SelectItem>
              <SelectItem value="raw">Raw</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Importance">
          <Select
            value={filters.importance ?? ALL}
            onValueChange={(v) =>
              setFilter('importance', v === ALL ? undefined : (v as ArticleImportance))
            }
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Feed">
          <Select
            value={filters.feedId ?? ALL}
            onValueChange={(v) => setFilter('feedId', v === ALL ? undefined : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All feeds</SelectItem>
              {feeds.data?.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name ?? f.url}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Category">
          <Select
            value={filters.category ?? ALL}
            onValueChange={(v) => setFilter('category', v === ALL ? undefined : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="From">
          <Input
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => setFilter('from', e.target.value || undefined)}
            className="w-[150px]"
          />
        </FilterField>

        <FilterField label="To">
          <Input
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => setFilter('to', e.target.value || undefined)}
            className="w-[150px]"
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

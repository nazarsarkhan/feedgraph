import { Link } from 'react-router-dom';
import { EntityFilterBar } from '@/components/entities/EntityFilterBar';
import { EntityRow } from '@/components/entities/EntityRow';
import { PaginationControls } from '@/components/articles/PaginationControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEntities } from '@/hooks/useEntities';
import { useEntityFilters } from '@/hooks/useEntityFilters';
import type { EntitySortBy, SortOrder } from '@/lib/entities';

type SortKey = `${EntitySortBy}:${SortOrder}`;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'lastSeen:desc', label: 'Recently mentioned' },
  { value: 'lastSeen:asc', label: 'Least recently mentioned' },
  { value: 'mentionCount:desc', label: 'Most mentioned' },
  { value: 'mentionCount:asc', label: 'Least mentioned' },
  { value: 'name:asc', label: 'A → Z' },
  { value: 'name:desc', label: 'Z → A' },
];

export function EntitiesPage() {
  const { filters, setFilter, setFilters, reset, activeFilterCount } = useEntityFilters();
  const entities = useEntities(filters);

  const sortValue: SortKey = `${filters.sortBy ?? 'lastSeen'}:${filters.order ?? 'desc'}`;
  const onSortChange = (v: string): void => {
    const [sortBy, order] = v.split(':') as [EntitySortBy, SortOrder];
    // Both keys in ONE URL update so neither clobbers the other.
    setFilters({ sortBy, order });
  };

  const isRefetching = entities.isFetching && !entities.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entities</h1>
          <p className="text-sm text-muted-foreground">
            People, companies, products, technologies, and places extracted from your articles.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Sort</span>
          <Select value={sortValue} onValueChange={onSortChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <EntityFilterBar
        filters={filters}
        setFilter={setFilter}
        reset={reset}
        activeFilterCount={activeFilterCount}
      />

      <div className="h-0.5 overflow-hidden">
        {isRefetching && <div className="h-full w-full animate-pulse bg-primary/60" />}
      </div>

      {entities.isPending && <SkeletonList />}

      {entities.error && (
        <Card>
          <CardHeader>
            <CardTitle>Could not load entities</CardTitle>
            <CardDescription>{entities.error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => entities.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {entities.data && entities.data.items.length === 0 && activeFilterCount > 0 && (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>No entities match these filters</CardTitle>
            <CardDescription>Try widening or removing some criteria.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={reset}>Clear all filters</Button>
          </CardContent>
        </Card>
      )}

      {entities.data && entities.data.items.length === 0 && activeFilterCount === 0 && (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>No entities yet</CardTitle>
            <CardDescription>
              Add a feed and wait for processing — entities are extracted from your articles.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/feeds">Go to Feeds</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {entities.data && entities.data.items.length > 0 && (
        <>
          <div className="divide-y rounded-md border">
            {entities.data.items.map((e) => (
              <EntityRow key={e.id} entity={e} />
            ))}
          </div>
          <PaginationControls
            pagination={entities.data.pagination}
            onPrev={() => setFilter('page', Math.max(1, entities.data.pagination.page - 1))}
            onNext={() =>
              setFilter(
                'page',
                Math.min(entities.data.pagination.totalPages, entities.data.pagination.page + 1),
              )
            }
            onPage={(p) => setFilter('page', p)}
          />
        </>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="divide-y rounded-md border">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2 px-4 py-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

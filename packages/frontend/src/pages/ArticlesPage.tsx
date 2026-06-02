import { Link } from 'react-router-dom';
import { ArticleFilterBar } from '@/components/articles/ArticleFilterBar';
import { ArticleRow } from '@/components/articles/ArticleRow';
import { PaginationControls } from '@/components/articles/PaginationControls';
import { RegenerateFilteredButton } from '@/components/articles/RegenerateFilteredButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useArticleFilters } from '@/hooks/useArticleFilters';
import { useArticles } from '@/hooks/useArticles';
import type { ArticleSortBy, SortOrder } from '@/lib/articles';

type SortKey = `${ArticleSortBy}:${SortOrder}`;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'publishedAt:desc', label: 'Newest first' },
  { value: 'publishedAt:asc', label: 'Oldest first' },
  { value: 'createdAt:desc', label: 'Recently added' },
  { value: 'createdAt:asc', label: 'Oldest added' },
];

export function ArticlesPage() {
  const { filters, setFilter, reset, activeFilterCount } = useArticleFilters();
  const articles = useArticles(filters);

  const sortValue: SortKey = `${filters.sortBy ?? 'publishedAt'}:${filters.order ?? 'desc'}`;
  const onSortChange = (v: string): void => {
    const [sortBy, order] = v.split(':') as [ArticleSortBy, SortOrder];
    setFilter('sortBy', sortBy);
    setFilter('order', order);
  };

  const isRefetching = articles.isFetching && !articles.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Articles</h1>
          <p className="text-sm text-muted-foreground">
            Filtered, sorted, and paginated view of every ingested article.
          </p>
        </div>
        <div className="flex items-end gap-3">
          {/* Self-hides unless a regenerate-relevant filter is active. */}
          <RegenerateFilteredButton filters={filters} />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Sort</span>
            <Select value={sortValue} onValueChange={onSortChange}>
              <SelectTrigger className="w-[180px]">
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
      </div>

      <ArticleFilterBar
        filters={filters}
        setFilter={setFilter}
        reset={reset}
        activeFilterCount={activeFilterCount}
      />

      {/* Thin top-of-list progress indicator while a refetch is in flight. */}
      <div className="h-0.5 overflow-hidden">
        {isRefetching && <div className="h-full w-full animate-pulse bg-primary/60" />}
      </div>

      {articles.isPending && <SkeletonList />}

      {articles.error && (
        <Card>
          <CardHeader>
            <CardTitle>Could not load articles</CardTitle>
            <CardDescription>{articles.error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => articles.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {articles.data && articles.data.items.length === 0 && activeFilterCount > 0 && (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>No articles match these filters</CardTitle>
            <CardDescription>Try widening or removing some criteria.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={reset}>Clear all filters</Button>
          </CardContent>
        </Card>
      )}

      {articles.data && articles.data.items.length === 0 && activeFilterCount === 0 && (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>No articles yet</CardTitle>
            <CardDescription>Add a feed to start collecting articles.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/feeds">Go to Feeds</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {articles.data && articles.data.items.length > 0 && (
        <>
          <div className="rounded-md border divide-y">
            {articles.data.items.map((a) => (
              <ArticleRow key={a.id} article={a} />
            ))}
          </div>
          <PaginationControls
            pagination={articles.data.pagination}
            onPrev={() => setFilter('page', Math.max(1, articles.data.pagination.page - 1))}
            onNext={() =>
              setFilter(
                'page',
                Math.min(articles.data.pagination.totalPages, articles.data.pagination.page + 1),
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
    <div className="rounded-md border divide-y">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2 px-4 py-4">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

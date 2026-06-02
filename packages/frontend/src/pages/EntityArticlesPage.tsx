import { Link, useParams, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { PaginationControls } from '@/components/articles/PaginationControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEntity } from '@/hooks/useEntity';
import { useEntityArticles } from '@/hooks/useEntityArticles';
import { formatAbsolute } from '@/lib/timezone';

const PAGE_SIZE = 20;

/**
 * "See all articles mentioning this entity" — the paginated companion to the
 * entity-detail page's capped list. Backed by GET /entities/:id/articles.
 */
export function EntityArticlesPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page')) || 1;

  const entity = useEntity(id);
  const query = useEntityArticles(id, page, PAGE_SIZE);

  const setPage = (p: number): void => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    });
  };

  const name = entity.data?.canonicalName ?? 'entity';

  return (
    <div className="space-y-4">
      <Link
        to={`/entities/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to {name}
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Articles mentioning {name}</h1>
        {query.data && (
          <p className="text-sm text-muted-foreground">
            {query.data.pagination.total} article
            {query.data.pagination.total === 1 ? '' : 's'} in total.
          </p>
        )}
      </header>

      {query.isPending && <SkeletonList />}

      {query.error && (
        <Card>
          <CardHeader>
            <CardTitle>Could not load articles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{query.error.message}</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.items.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No articles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This entity isn&apos;t referenced by any article.
            </p>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.items.length > 0 && (
        <>
          <div className="divide-y rounded-md border">
            {query.data.items.map((a) => {
              const rel = a.publishedAt
                ? formatDistanceToNow(new Date(a.publishedAt), { addSuffix: true })
                : null;
              return (
                <Link
                  key={a.id}
                  to={`/articles/${a.id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
                >
                  <span className="truncate text-sm font-medium">{a.title ?? '(untitled)'}</span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {a.feedName && <span>{a.feedName}</span>}
                    {rel && <span title={formatAbsolute(a.publishedAt)}>{rel}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
          <PaginationControls
            pagination={query.data.pagination}
            onPrev={() => setPage(Math.max(1, page - 1))}
            onNext={() => setPage(Math.min(query.data.pagination.totalPages, page + 1))}
            onPage={setPage}
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
        <div key={i} className="space-y-2 px-4 py-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

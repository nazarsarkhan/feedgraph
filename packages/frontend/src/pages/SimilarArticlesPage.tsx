import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Layers } from 'lucide-react';
import { PaginationControls } from '@/components/articles/PaginationControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useArticle } from '@/hooks/useArticle';
import { useSimilarArticles } from '@/hooks/useSimilarArticles';

const PAGE_SIZE = 20;

/**
 * "See all similar articles" — the paginated companion to the capped
 * cross-source cluster on the article-detail page. Backed by
 * GET /articles/:id/similar.
 */
export function SimilarArticlesPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page')) || 1;

  const article = useArticle(id);
  const query = useSimilarArticles(id, page, PAGE_SIZE);

  const setPage = (p: number): void => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    });
  };

  const title = article.data?.title ?? 'this article';

  return (
    <div className="space-y-4">
      <Link
        to={`/articles/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to article
      </Link>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Layers className="h-5 w-5" />
          Similar articles
        </h1>
        <p className="text-sm text-muted-foreground">
          Cross-source matches for <span className="font-medium text-foreground">{title}</span>
          {query.data ? ` — ${query.data.pagination.total} in total.` : '.'}
        </p>
      </header>

      {query.isPending && <SkeletonList />}

      {query.error && (
        <Card>
          <CardHeader>
            <CardTitle>Could not load similar articles</CardTitle>
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
            <CardTitle>No similar articles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No other source published a matching version of this story.
            </p>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.items.length > 0 && (
        <>
          <ul className="divide-y rounded-md border">
            {query.data.items.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/articles/${s.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
                >
                  <div className="truncate text-sm font-medium">{s.title ?? '(untitled)'}</div>
                  {s.feedName && <div className="text-xs text-muted-foreground">{s.feedName}</div>}
                </Link>
              </li>
            ))}
          </ul>
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
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 px-4 py-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

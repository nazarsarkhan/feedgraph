import { Link } from 'react-router-dom';
import { Layers } from 'lucide-react';
import type { SimilarArticle } from '@/lib/articles';

interface Props {
  articleId: string;
  similarArticles: SimilarArticle[];
  // Total size of the cross-source cluster (article.similarCount). When it
  // exceeds the inlined (capped) list, we surface a "See all" link to the
  // paginated view.
  totalCount: number;
}

export function SimilarArticlesSection({ articleId, similarArticles, totalCount }: Props) {
  if (similarArticles.length === 0) return null;

  const hasMore = totalCount > similarArticles.length;

  return (
    <section className="mt-8 border-t pt-6">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4" />
          Similar articles in other sources
          <span className="text-muted-foreground">({totalCount})</span>
        </h2>
        {hasMore && (
          <Link
            to={`/articles/${articleId}/similar`}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            See all
          </Link>
        )}
      </div>
      <ul className="space-y-2">
        {similarArticles.map((s) => (
          <li key={s.id}>
            <Link
              to={`/articles/${s.id}`}
              className="block rounded-md px-3 py-2 transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
            >
              <div className="text-sm font-medium">{s.title ?? '(untitled)'}</div>
              {s.feedName && <div className="text-xs text-muted-foreground">{s.feedName}</div>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { Layers } from 'lucide-react';
import type { SimilarArticle } from '@/lib/articles';

interface Props {
  similarArticles: SimilarArticle[];
}

export function SimilarArticlesSection({ similarArticles }: Props) {
  if (similarArticles.length === 0) return null;

  return (
    <section className="mt-8 border-t pt-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Layers className="h-4 w-4" />
        Similar articles in other sources
        <span className="text-muted-foreground">({similarArticles.length})</span>
      </h2>
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

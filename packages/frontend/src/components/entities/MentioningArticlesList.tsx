import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import type { MentioningArticle } from '@/lib/entities';

interface Props {
  articles: MentioningArticle[];
}

export function MentioningArticlesList({ articles }: Props) {
  if (articles.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">
        Appears in <span className="text-muted-foreground">({articles.length})</span>
      </h2>
      <div className="divide-y rounded-md border">
        {articles.map((a) => {
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
                {rel && <span title={a.publishedAt ?? undefined}>{rel}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

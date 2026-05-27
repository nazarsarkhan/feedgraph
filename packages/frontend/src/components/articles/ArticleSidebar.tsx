import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { ArticleDetail } from '@/lib/articles';

interface Props {
  article: ArticleDetail;
}

export function ArticleSidebar({ article }: Props) {
  const hasAnything =
    article.entities.length > 0 ||
    article.categories.length > 0 ||
    article.axisAssignments.length > 0;

  if (!hasAnything) return null;

  return (
    <aside className="space-y-6 text-sm lg:sticky lg:top-20 lg:self-start">
      {article.entities.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Entities
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {article.entities.map((e) => (
              <Link
                key={e.id}
                to={`/entities/${e.id}`}
                className="rounded-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Badge variant="outline" className="font-normal hover:bg-accent">
                  {e.name}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {article.categories.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Categories
          </h2>
          <ul className="space-y-1 text-foreground">
            {article.categories.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {article.axisAssignments.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Classification
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {article.axisAssignments.map(({ axis, value }) => (
              <div key={`${axis}:${value}`} className="contents">
                <dt className="text-muted-foreground">{axis}</dt>
                <dd className="text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </aside>
  );
}

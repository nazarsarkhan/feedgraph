import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { ArticleDetail, ArticleEntity } from '@/lib/articles';
import { ENTITY_TYPE_BADGE_CLASS, ENTITY_TYPE_LABEL, ENTITY_TYPE_ORDER } from '@/lib/entity-type';
import { cn } from '@/lib/utils';

interface Props {
  article: ArticleDetail;
}

// Bucket entities by type in the canonical display order. An entity whose
// type isn't one of the known palette keys lands in a trailing "Other" group
// so nothing is silently dropped. Returns only non-empty groups.
function groupByType(
  entities: ArticleEntity[],
): { label: string; typeClass: string; items: ArticleEntity[] }[] {
  const groups: { label: string; typeClass: string; items: ArticleEntity[] }[] = [];
  for (const type of ENTITY_TYPE_ORDER) {
    const items = entities.filter((e) => e.type === type);
    if (items.length > 0) {
      groups.push({
        label: ENTITY_TYPE_LABEL[type],
        typeClass: ENTITY_TYPE_BADGE_CLASS[type],
        items,
      });
    }
  }
  const known = new Set<string>(ENTITY_TYPE_ORDER as readonly string[]);
  const others = entities.filter((e) => !known.has(e.type));
  if (others.length > 0) groups.push({ label: 'Other', typeClass: '', items: others });
  return groups;
}

export function ArticleSidebar({ article }: Props) {
  const hasAnything =
    article.entities.length > 0 ||
    article.categories.length > 0 ||
    article.axisAssignments.length > 0;

  if (!hasAnything) return null;

  const entityGroups = groupByType(article.entities);

  return (
    <aside className="space-y-6 text-sm lg:sticky lg:top-20 lg:self-start">
      {article.entities.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Entities
          </h2>
          {entityGroups.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {group.label}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((e) => (
                  <Link
                    key={e.id}
                    to={`/entities/${e.id}`}
                    className="rounded-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <Badge
                      variant="outline"
                      className={cn('font-normal hover:bg-accent', group.typeClass)}
                    >
                      {e.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          ))}
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

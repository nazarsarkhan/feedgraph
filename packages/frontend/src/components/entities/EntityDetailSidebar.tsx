import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import type { EntityDetail, EntityType } from '@/lib/entities';

const TYPE_LABEL: Record<EntityType, string> = {
  person: 'Person',
  company: 'Company',
  product: 'Product',
  technology: 'Technology',
  location: 'Location',
};

interface Props {
  entity: EntityDetail;
}

function fmtDate(iso: string): string {
  return format(parseISO(iso), 'MMM d, yyyy');
}

export function EntityDetailSidebar({ entity }: Props) {
  return (
    <aside className="space-y-6 text-sm lg:sticky lg:top-20 lg:self-start">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          About
        </h2>
        <div className="space-y-2">
          <Badge variant="outline">{TYPE_LABEL[entity.type]}</Badge>

          {entity.aliases.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Also known as: {entity.aliases.join(', ')}
            </p>
          )}

          {entity.description && (
            <p className="text-sm leading-relaxed text-foreground">{entity.description}</p>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1 text-xs">
            <dt className="text-muted-foreground">Mentions</dt>
            <dd className="text-foreground">{entity.mentionCount}</dd>
            <dt className="text-muted-foreground">First seen</dt>
            <dd className="text-foreground" title={entity.firstSeen}>
              {fmtDate(entity.firstSeen)}
            </dd>
            <dt className="text-muted-foreground">Last seen</dt>
            <dd className="text-foreground" title={entity.lastSeen}>
              {fmtDate(entity.lastSeen)}
            </dd>
          </dl>
        </div>
      </section>

      {entity.relatedEntities.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Related entities
          </h2>
          <ul className="space-y-1">
            {entity.relatedEntities.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/entities/${r.id}`}
                  className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 -mx-2 transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
                >
                  <span className="min-w-0 truncate">{r.canonicalName}</span>
                  <Badge variant="outline" className="shrink-0 font-normal">
                    co-mentioned {r.coMentionCount}&times;
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

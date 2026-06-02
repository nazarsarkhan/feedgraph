import { format, parseISO } from 'date-fns';
import { EntityTypeBadge } from '@/components/entities/EntityTypeBadge';
import type { EntityDetail } from '@/lib/entities';
import { formatAbsolute } from '@/lib/timezone';

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
          <EntityTypeBadge type={entity.type} />

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
            <dd className="text-foreground" title={formatAbsolute(entity.firstSeen)}>
              {fmtDate(entity.firstSeen)}
            </dd>
            <dt className="text-muted-foreground">Last seen</dt>
            <dd className="text-foreground" title={formatAbsolute(entity.lastSeen)}>
              {fmtDate(entity.lastSeen)}
            </dd>
          </dl>
        </div>
      </section>
    </aside>
  );
}

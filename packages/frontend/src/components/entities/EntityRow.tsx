import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquareText } from 'lucide-react';
import { EntityTypeBadge } from '@/components/entities/EntityTypeBadge';
import type { EntityListItem } from '@/lib/entities';
import { formatAbsolute } from '@/lib/timezone';
import { cn } from '@/lib/utils';

interface Props {
  entity: EntityListItem;
}

export function EntityRow({ entity }: Props) {
  const lastSeenRel = formatDistanceToNow(new Date(entity.lastSeen), { addSuffix: true });
  const firstSeenRel = formatDistanceToNow(new Date(entity.firstSeen), { addSuffix: true });
  const aliasesShown = entity.aliases.slice(0, 3);
  const extraAliases = Math.max(0, entity.aliases.length - aliasesShown.length);

  return (
    <Link
      to={`/entities/${entity.id}`}
      className={cn(
        'flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-sm font-semibold">{entity.canonicalName}</h2>

          {aliasesShown.length > 0 && (
            <p className="truncate text-xs text-muted-foreground">
              Also known as: {aliasesShown.join(', ')}
              {extraAliases > 0 && ` +${extraAliases} more`}
            </p>
          )}

          {entity.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{entity.description}</p>
          )}
        </div>

        <EntityTypeBadge type={entity.type} className="shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MessageSquareText className="h-3 w-3" />
          {entity.mentionCount} mention{entity.mentionCount === 1 ? '' : 's'}
        </span>
        <span title={formatAbsolute(entity.lastSeen)}>Last seen {lastSeenRel}</span>
        <span title={formatAbsolute(entity.firstSeen)}>First seen {firstSeenRel}</span>
      </div>
    </Link>
  );
}

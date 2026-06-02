import { Badge } from '@/components/ui/badge';
import type { EntityType } from '@/lib/entities';
import { ENTITY_TYPE_BADGE_CLASS, ENTITY_TYPE_LABEL } from '@/lib/entity-type';
import { cn } from '@/lib/utils';

interface Props {
  type: EntityType;
  className?: string;
}

/**
 * Outline badge for an entity type, tinted by the shared per-type palette.
 * One component for every place a type label appears (list rows, detail
 * header, sidebar) so the colour-to-type mapping can never drift.
 */
export function EntityTypeBadge({ type, className }: Props) {
  return (
    <Badge variant="outline" className={cn(ENTITY_TYPE_BADGE_CLASS[type], className)}>
      {ENTITY_TYPE_LABEL[type]}
    </Badge>
  );
}

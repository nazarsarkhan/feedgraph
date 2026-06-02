import type { KeyboardEvent, MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ArticleListItem } from '@/lib/articles';
import type { EntityType } from '@/lib/entities';
import { ENTITY_TYPE_BADGE_CLASS } from '@/lib/entity-type';
import { formatAbsolute } from '@/lib/timezone';
import { cn } from '@/lib/utils';

// The article entity carries `type` as a free string; narrow to the known
// palette keys and fall back to a plain outline tint for anything unexpected.
function typeBadgeClass(type: string): string {
  return ENTITY_TYPE_BADGE_CLASS[type as EntityType] ?? '';
}

const STATUS_LABEL: Record<ArticleListItem['status'], string> = {
  raw: 'Raw',
  filtered: 'Filtered',
  pending_llm: 'Pending',
  processed: 'Processed',
  error: 'Error',
};

const STATUS_VARIANT = {
  raw: 'secondary',
  filtered: 'secondary',
  pending_llm: 'secondary',
  processed: 'success',
  error: 'destructive',
} as const;

const MAX_ENTITY_PILLS = 3;

interface Props {
  article: ArticleListItem;
}

export function ArticleRow({ article }: Props) {
  const navigate = useNavigate();
  const date = article.publishedAt ?? article.createdAt;
  const relative = formatDistanceToNow(new Date(date), { addSuffix: true });
  const extraEntities = Math.max(0, article.entities.length - MAX_ENTITY_PILLS);

  const goToArticle = (): void => {
    navigate(`/articles/${article.id}`);
  };

  // The row is a div, not a Link, so the entity badges inside it can be real
  // <Link>s (a Link nested in a Link is invalid HTML). role/tabIndex/onKeyDown
  // restore the keyboard + a11y affordances the outer Link used to provide.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goToArticle();
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={article.title ?? '(untitled)'}
      onClick={goToArticle}
      onKeyDown={onKeyDown}
      className={cn(
        'flex cursor-pointer flex-col gap-2 px-4 py-4 transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            {article.importance === 'high' && (
              <Badge variant="default" className="shrink-0">
                High
              </Badge>
            )}
            <h2 className="truncate text-sm font-semibold">{article.title ?? '(untitled)'}</h2>
          </div>

          {article.status === 'processed' && article.summary && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{article.summary}</p>
          )}
          {article.status === 'filtered' && article.filterReason && (
            <p className="text-xs text-muted-foreground">
              Filtered: <code>{article.filterReason}</code>
            </p>
          )}
          {article.status === 'pending_llm' && (
            <p className="text-xs italic text-muted-foreground">Awaiting analysis…</p>
          )}
        </div>

        {article.status !== 'processed' && (
          <Badge variant={STATUS_VARIANT[article.status]} className="shrink-0">
            {STATUS_LABEL[article.status]}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {article.feedName && <span>{article.feedName}</span>}
        <span title={formatAbsolute(date)}>{relative}</span>
        {article.categories.length > 0 && <span>{article.categories.join(' · ')}</span>}
        {article.entities.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {article.entities.slice(0, MAX_ENTITY_PILLS).map((e) => (
              <Link
                key={e.id}
                to={`/entities/${e.id}`}
                // Stop the row's own navigate from firing — this badge is a
                // deep link to the entity, the row links to the article.
                onClick={(ev: MouseEvent) => ev.stopPropagation()}
                className="rounded-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Badge
                  variant="outline"
                  className={cn('font-normal hover:bg-accent', typeBadgeClass(e.type))}
                >
                  {e.name}
                </Badge>
              </Link>
            ))}
            {extraEntities > 0 && (
              <span className="text-muted-foreground/80">+{extraEntities} more</span>
            )}
          </span>
        )}
        {article.similarCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {article.similarCount} similar
          </span>
        )}
      </div>
    </div>
  );
}

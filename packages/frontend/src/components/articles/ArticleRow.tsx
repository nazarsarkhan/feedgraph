import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ArticleListItem } from '@/lib/articles';
import { cn } from '@/lib/utils';

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
  const date = article.publishedAt ?? article.createdAt;
  const relative = formatDistanceToNow(new Date(date), { addSuffix: true });
  const extraEntities = Math.max(0, article.entities.length - MAX_ENTITY_PILLS);

  return (
    <Link
      to={`/articles/${article.id}`}
      className={cn(
        'flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none',
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
        <span title={date}>{relative}</span>
        {article.categories.length > 0 && <span>{article.categories.join(' · ')}</span>}
        {article.entities.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {article.entities.slice(0, MAX_ENTITY_PILLS).map((e) => (
              <Badge key={`${e.type}:${e.name}`} variant="outline" className="font-normal">
                {e.name}
              </Badge>
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
    </Link>
  );
}

import { formatDistanceToNow, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DigestItem, DigestSentiment } from '@/lib/digests';
import { cn } from '@/lib/utils';

// Token classes (light + dark) for the four-way sentiment dot.
const SENTIMENT_STYLES: Record<DigestSentiment, string> = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  mixed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

interface Props {
  digest: DigestItem;
}

export function DigestCard({ digest }: Props) {
  const periodLabel = formatPeriod(digest);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{periodLabel}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>
                {digest.articleCount} article{digest.articleCount === 1 ? '' : 's'}
              </span>
              {digest.sentiment && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    SENTIMENT_STYLES[digest.sentiment],
                  )}
                >
                  {digest.sentiment}
                </span>
              )}
            </CardDescription>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(parseISO(digest.createdAt), { addSuffix: true })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed">{digest.summary}</p>

        {digest.keyThemes.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Key themes
            </p>
            <div className="flex flex-wrap gap-1">
              {digest.keyThemes.map((theme) => (
                <Badge key={theme} variant="secondary" className="text-xs">
                  {theme}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {digest.topEntities.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top entities
            </p>
            <div className="flex flex-wrap gap-1">
              {digest.topEntities.map((e) => (
                <Badge key={e} variant="outline" className="text-xs">
                  {e}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Plain string formatting — dates from the backend are YYYY-MM-DD calendar
// dates with no time component, so we don't go through Date (which would
// add timezone confusion). Month label uses Intl.DateTimeFormat for the
// readable name; week/day just stitches the ISO strings.
function formatPeriod(d: DigestItem): string {
  if (d.periodType === 'day') {
    return `Day of ${formatDateLong(d.periodStart)}`;
  }
  if (d.periodType === 'week') {
    return `Week of ${formatDateLong(d.periodStart)} – ${formatDateLong(d.periodEnd)}`;
  }
  return `Month of ${formatMonthLong(d.periodStart)}`;
}

function formatDateLong(iso: string): string {
  // Append explicit UTC noon to dodge any DST-rollover quirk in the user's
  // local zone shifting our calendar-date display by one day. The actual
  // calendar date in the YYYY-MM-DD string is what we want shown.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMonthLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}

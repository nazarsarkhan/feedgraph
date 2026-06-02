import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaginationMeta } from '@/lib/articles';
import { cn } from '@/lib/utils';

interface Props {
  pagination: PaginationMeta;
  onPrev: () => void;
  onNext: () => void;
  // Optional jump-to-page handler. When supplied AND there are more than
  // NUMBERED_THRESHOLD pages, a numbered control (1 … 4 5 6 … 200) renders
  // between Prev/Next. Omit it (the default) to keep the plain Prev/Next bar
  // — small lists don't benefit from page numbers.
  onPage?: (page: number) => void;
}

// Below this many pages, Prev/Next alone is plenty and numbers are clutter.
const NUMBERED_THRESHOLD = 10;
// How many pages to show on each side of the current page in the window.
const SIBLINGS = 1;

// Build the page list with first/last anchors, a window around the current
// page, and 'gap' sentinels where pages are elided. e.g. for page 6 of 200:
// [1, 'gap', 5, 6, 7, 'gap', 200].
function buildPageItems(current: number, total: number): (number | 'gap')[] {
  const pages = new Set<number>([1, total]);
  for (let p = current - SIBLINGS; p <= current + SIBLINGS; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of sorted) {
    // A gap of exactly one missing page is rendered as that page, not an
    // ellipsis — an ellipsis hiding a single page is silly.
    if (p - prev === 2) items.push(prev + 1);
    else if (p - prev > 2) items.push('gap');
    items.push(p);
    prev = p;
  }
  return items;
}

export function PaginationControls({ pagination, onPrev, onNext, onPage }: Props) {
  const { page, pageSize, total, totalPages } = pagination;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const showNumbers = onPage !== undefined && totalPages > NUMBERED_THRESHOLD;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={onPrev}>
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>

      {showNumbers ? (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          {buildPageItems(page, totalPages).map((item, i) =>
            item === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <Button
                key={item}
                variant={item === page ? 'default' : 'outline'}
                size="sm"
                aria-current={item === page ? 'page' : undefined}
                className={cn('min-w-9 px-2', item === page && 'pointer-events-none')}
                onClick={() => onPage(item)}
              >
                {item}
              </Button>
            ),
          )}
        </nav>
      ) : (
        <div className="text-sm text-muted-foreground" aria-live="polite">
          Page {page} of {totalPages} <span aria-hidden="true">•</span> Showing {first}–{last} of{' '}
          {total}
        </div>
      )}

      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={onNext}>
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

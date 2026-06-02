import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  /** Route the back link points to, e.g. "/articles". */
  backTo: string;
  /** Label after the back arrow, e.g. "Articles". */
  backLabel: string;
  /** Sticky right-hand sidebar content (280px column on lg+). */
  sidebar: ReactNode;
  /** Main column content. */
  children: ReactNode;
}

/**
 * Shared shell for detail pages: a "← Back" link above a
 * `[1fr_280px]` grid with a sticky sidebar. Extracted once the article and
 * entity detail pages had grown a third sibling (the see-all paginated
 * views) — the grid shape and back-link pattern were identical in all of
 * them. See the "<DetailLayout> extraction" tech-debt entry.
 */
export function DetailLayout({ backTo, backLabel, sidebar, children }: Props) {
  return (
    <div className="space-y-4">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {backLabel}
      </Link>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-6">{children}</div>
        {sidebar}
      </div>
    </div>
  );
}

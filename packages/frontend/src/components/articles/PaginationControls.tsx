import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaginationMeta } from '@/lib/articles';

interface Props {
  pagination: PaginationMeta;
  onPrev: () => void;
  onNext: () => void;
}

export function PaginationControls({ pagination, onPrev, onNext }: Props) {
  const { page, pageSize, total, totalPages } = pagination;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between py-4">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={onPrev}>
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>
      <div className="text-sm text-muted-foreground" aria-live="polite">
        Page {page} of {totalPages} <span aria-hidden="true">•</span> Showing {first}–{last} of{' '}
        {total}
      </div>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={onNext}>
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

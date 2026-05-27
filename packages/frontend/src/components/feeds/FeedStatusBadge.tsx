import { Badge } from '@/components/ui/badge';
import type { FeedStatus } from '@/lib/feeds';

const STATUS_LABEL: Record<FeedStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  error: 'Error',
};

const STATUS_VARIANT = {
  active: 'success',
  paused: 'secondary',
  error: 'destructive',
} as const;

export function FeedStatusBadge({ status }: { status: FeedStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

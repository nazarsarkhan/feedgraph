import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { EntityType } from '@/lib/entities';
import type { EntityRFNode } from '@/lib/graph-layout';
import { cn } from '@/lib/utils';

// The Graph page is the one place in the app where entity types get
// semantic color hints. The entities list page uses outline-only
// badges (consistent flat surface); here, distinguishing types at a
// glance is the whole point of the visualization.
const TYPE_COLORS: Record<EntityType, string> = {
  company: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
  product: 'bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800',
  person: 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
  technology: 'bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800',
  location: 'bg-rose-50 border-rose-200 dark:bg-rose-950 dark:border-rose-800',
};

export function EntityNode({ data }: NodeProps<EntityRFNode>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div
        className={cn(
          'flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-full border-2 text-center',
          'shadow-sm transition-shadow hover:shadow-md',
          TYPE_COLORS[data.type] ?? 'border-border bg-muted',
        )}
      >
        <span className="line-clamp-2 px-2 text-xs font-semibold leading-tight">
          {data.canonicalName}
        </span>
        <span className="mt-0.5 text-[10px] text-muted-foreground">
          {data.mentionCount} mention{data.mentionCount === 1 ? '' : 's'}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </>
  );
}

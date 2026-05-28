import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { EntityType } from '@/lib/entities';
import type { EntityRFNode } from '@/lib/graph-layout';
import { cn } from '@/lib/utils';

// Light tints chosen so the dimmed (.graph-dimmed opacity 0.12) and
// full-opacity states both read clearly against the canvas background.
// Each type gets its own hue — the Graph page is the one place in the
// app where entity types get semantic color.
const TYPE_COLORS: Record<EntityType, string> = {
  company: 'bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700',
  product: 'bg-purple-100 border-purple-300 dark:bg-purple-900 dark:border-purple-700',
  person: 'bg-green-100 border-green-300 dark:bg-green-900 dark:border-green-700',
  technology: 'bg-orange-100 border-orange-300 dark:bg-orange-900 dark:border-orange-700',
  location: 'bg-rose-100 border-rose-300 dark:bg-rose-900 dark:border-rose-700',
};

// Hover dimming + highlight ring are applied via CSS classes
// (.graph-dimmed / .graph-highlighted) toggled by GraphPage's
// onNodeMouseEnter handler directly on the .react-flow__node
// element — no React state, no re-renders during hover.
export function EntityNode({ data }: NodeProps<EntityRFNode>) {
  const size = data.nodeSize;
  const truncated =
    data.canonicalName.length > 18 ? `${data.canonicalName.slice(0, 16)}…` : data.canonicalName;

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {/* `entity-node-circle` is the DOM anchor for the hover highlight
          ring — see GraphPage's onNodeMouseEnter and the matching CSS
          rule in src/index.css. Targeting this inner element keeps the
          box-shadow ring round (the circle's own shape) instead of
          painting a rectangle around the .react-flow__node wrapper. */}
      <div
        className={cn(
          'entity-node-circle flex h-full w-full cursor-pointer items-center justify-center rounded-full border-2 shadow-sm transition-shadow hover:shadow-md',
          TYPE_COLORS[data.type] ?? 'border-border bg-muted',
        )}
      >
        {/* Below ~24px the circle is too small for any text — show the
            first letter only and rely on the label underneath for the
            full name. */}
        {size < 24 ? (
          <span className="text-[8px] font-bold leading-none">
            {data.canonicalName[0]?.toUpperCase() ?? '?'}
          </span>
        ) : (
          <span className="px-1 text-center text-[9px] font-semibold leading-tight">
            {data.canonicalName.length > 8
              ? `${data.canonicalName.slice(0, 7)}…`
              : data.canonicalName}
          </span>
        )}
      </div>
      {/* Label below the node — outside the circle so the canonical
          name is always legible regardless of node size. */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center"
        style={{ top: size + 4 }}
      >
        <span className="text-[10px] font-medium text-foreground/80 drop-shadow-sm">
          {truncated}
        </span>
        {data.mentionCount > 1 && (
          <span className="ml-1 text-[9px] text-muted-foreground">{data.mentionCount}</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

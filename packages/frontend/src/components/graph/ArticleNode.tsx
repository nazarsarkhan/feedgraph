import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';

// Importance → background+border colors. 'junk' is unreachable in
// practice (junk articles never reach status='processed', so they're
// not in the graph query) but included for type completeness.
const IMPORTANCE_COLORS: Record<'high' | 'normal' | 'junk', string> = {
  high: 'bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700',
  normal: 'bg-slate-50 border-slate-300 dark:bg-slate-900 dark:border-slate-700',
  junk: 'bg-slate-50 border-slate-200 opacity-50',
};

const TITLE_TRUNCATE = 20;

export interface ArticleNodeData extends Record<string, unknown> {
  label: string;
  importance: 'high' | 'normal' | 'junk';
  nodeSize: number;
}

export type ArticleRFNode = Node<ArticleNodeData, 'articleNode'>;

/**
 * Article node — a 5:3 rectangle with a truncated title inside, in
 * contrast to the round entity nodes. Article nodes have no hover
 * highlight ring of their own (we don't `entity-node-circle` them
 * because the highlight visuals are designed around the round
 * geometry); the wrapper-level dim/un-dim still applies during a
 * hover over a connected entity.
 *
 * Handles are pinned to the wrapper's center via the same CSS rule
 * that pins entity-node handles, so mentions edges visually emanate
 * from the rectangle's center rather than its top/bottom edges.
 */
export function ArticleNode({ data }: NodeProps<ArticleRFNode>) {
  const w = data.nodeSize;
  const h = data.nodeSize * 0.6;
  const truncated =
    data.label.length > TITLE_TRUNCATE ? `${data.label.slice(0, TITLE_TRUNCATE - 1)}…` : data.label;

  return (
    <div className="relative" style={{ width: w, height: h }}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div
        className={cn(
          'flex h-full w-full cursor-pointer items-center justify-center rounded-md border px-1 text-center shadow-sm',
          IMPORTANCE_COLORS[data.importance] ?? IMPORTANCE_COLORS.normal,
        )}
      >
        <span className="text-[7px] font-medium leading-tight line-clamp-2 text-foreground/80">
          {truncated}
        </span>
      </div>
      {/* Label below the box mirrors the entity node's label-overflow
          treatment so both kinds render their full title on hover-via-
          .react-flow__node overflow: visible. Kept blank here (the
          truncated title is already visible inside the rectangle) so
          articles don't double-render. */}
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

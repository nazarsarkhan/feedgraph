import type { Edge, Node } from '@xyflow/react';
import type { EntityType } from './entities';
import type { GraphEdge, GraphNode } from './graph';

const NODE_SIZE_MIN = 60;
const NODE_SIZE_MAX = 120;
const RADIUS_PER_NODE = 80;
const MIN_RADIUS = 200;

export interface EntityNodeData extends Record<string, unknown> {
  canonicalName: string;
  type: EntityType;
  mentionCount: number;
  nodeSize: number;
}

// v12 typing pattern: Node<DataShape, TypeKey> first, then NodeProps<EntityRFNode>.
// Letting the discriminator key 'entityNode' flow through means NodeProps
// in the consumer narrows by type automatically.
export type EntityRFNode = Node<EntityNodeData, 'entityNode'>;

/**
 * Deterministic circle layout. For N nodes the i-th node lands at
 * (cx + r cos θ, cy + r sin θ) where θ = 2π·i / N. Radius grows with N
 * so dense graphs don't crowd. Per-node size scales linearly with
 * mentionCount: 60px for the minimum mentioner, 120px for the most.
 * If every node has the same mentionCount we fall back to 60.
 */
export function buildReactFlowNodes(nodes: GraphNode[]): EntityRFNode[] {
  if (nodes.length === 0) return [];

  const maxMentions = Math.max(...nodes.map((n) => n.mentionCount), 1);
  const allEqual = nodes.every((n) => n.mentionCount === nodes[0].mentionCount);
  const n = nodes.length;
  const radius = Math.max(MIN_RADIUS, n * RADIUS_PER_NODE);
  const cx = radius + NODE_SIZE_MAX / 2;
  const cy = radius + NODE_SIZE_MAX / 2;

  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    const nodeSize = allEqual
      ? NODE_SIZE_MIN
      : NODE_SIZE_MIN + (node.mentionCount / maxMentions) * (NODE_SIZE_MAX - NODE_SIZE_MIN);

    return {
      id: node.id,
      type: 'entityNode' as const,
      position: {
        x: cx + radius * Math.cos(angle) - nodeSize / 2,
        y: cy + radius * Math.sin(angle) - nodeSize / 2,
      },
      data: {
        canonicalName: node.canonicalName,
        type: node.type,
        mentionCount: node.mentionCount,
        nodeSize,
      },
      style: { width: nodeSize, height: nodeSize },
    };
  });
}

/**
 * Linear stroke width by weight, capped at 4px so a runaway hub edge
 * (e.g. one entity with 50+ co-mentions) doesn't visually dominate.
 * Color from CSS var so the edge inherits the theme.
 */
export function buildReactFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((e) => ({
    id: `${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    style: {
      strokeWidth: Math.min(4, 1 + e.weight * 0.5),
      stroke: 'hsl(var(--muted-foreground))',
    },
    animated: false,
  }));
}

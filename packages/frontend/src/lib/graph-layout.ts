import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { Edge, Node } from '@xyflow/react';
import type { ArticleNodeData, ArticleRFNode } from '@/components/graph/ArticleNode';
import type { EntityType } from './entities';
import type { GraphEdge, GraphNode } from './graph';

const NODE_SIZE_MIN = 12;
const NODE_SIZE_MAX = 48;
// Article nodes are fixed-size — they convey importance via color
// (high vs normal background) rather than via radius, so they don't
// need to scale with mention count. Slightly larger than the smallest
// entity dot so the rectangle stays readable.
const ARTICLE_NODE_WIDTH = 22;
// 5:3 rectangle — same aspect ratio used inside ArticleNode.tsx.
const ARTICLE_NODE_ASPECT = 0.6;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;

export interface EntityNodeData extends Record<string, unknown> {
  canonicalName: string;
  type: EntityType;
  mentionCount: number;
  nodeSize: number;
  // Optional. When set, EntityNode picks the category-color tint
  // instead of the type color. The Graph page passes this only when
  // `colorBy === 'category'`; in `colorBy === 'type'` mode it's
  // undefined so the existing type palette is used.
  topCategory?: string;
}

// Visually-distinct pastel pairs used for category clustering. Eight
// is enough that even a power-user with many categories doesn't see
// runaway collisions; if it does, increase the palette before
// changing the hash. Bg + border for the circle; `dot` is the matching
// solid hex used in the legend dot below the filter bar.
export const CATEGORY_PALETTE: ReadonlyArray<{
  bg: string;
  border: string;
  dot: string;
}> = [
  { bg: 'bg-violet-100', border: 'border-violet-300', dot: '#8b5cf6' },
  { bg: 'bg-teal-100', border: 'border-teal-300', dot: '#14b8a6' },
  { bg: 'bg-rose-100', border: 'border-rose-300', dot: '#f43f5e' },
  { bg: 'bg-amber-100', border: 'border-amber-300', dot: '#f59e0b' },
  { bg: 'bg-cyan-100', border: 'border-cyan-300', dot: '#06b6d4' },
  { bg: 'bg-lime-100', border: 'border-lime-300', dot: '#84cc16' },
  { bg: 'bg-fuchsia-100', border: 'border-fuchsia-300', dot: '#d946ef' },
  { bg: 'bg-indigo-100', border: 'border-indigo-300', dot: '#6366f1' },
];

// djb2 — small, stable, well-distributed hash. Same name → same
// palette index → same color across reloads and across users.
function categoryColorIndex(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h) ^ name.charCodeAt(i);
  }
  // `>>> 0` coerces to unsigned 32-bit so the modulo doesn't pick up
  // a negative result from V8's signed bitwise ops.
  return (h >>> 0) % CATEGORY_PALETTE.length;
}

export function getCategoryColor(
  categoryName: string | null | undefined,
): (typeof CATEGORY_PALETTE)[number] | null {
  if (!categoryName) return null;
  return CATEGORY_PALETTE[categoryColorIndex(categoryName)];
}

export type EntityRFNode = Node<EntityNodeData, 'entityNode'>;

export interface LayoutResult {
  rfNodes: Array<EntityRFNode | ArticleRFNode>;
  rfEdges: Edge[];
}

// d3-force mutates these nodes in place — x, y, vx, vy are assigned by
// the simulation. We carry the data we need to construct the ReactFlow
// node alongside the simulation fields so we don't have to look them
// up by id on the way out. Discriminated by `kind` so the rfNode
// builder downstream picks the right type without a separate lookup.
type SimNode = SimulationNodeDatum &
  (
    | {
        id: string;
        kind: 'entity';
        canonicalName: string;
        type: EntityType;
        mentionCount: number;
        nodeSize: number;
        topCategory: string | null;
      }
    | {
        id: string;
        kind: 'article';
        label: string;
        importance: 'high' | 'normal';
        nodeSize: number;
      }
  );

export interface LayoutOptions {
  width?: number;
  height?: number;
}

type SimLink = SimulationLinkDatum<SimNode> & { weight: number; kind: 'co_mention' | 'mentions' };

/**
 * Run a d3-force simulation on the graph synchronously (no `.on('tick')`
 * — that would re-render React on every tick). 300 ticks at MVP scale
 * is enough to reach equilibrium for most graphs; we cap by
 * `log(n) * 50` so tiny graphs settle fast and huge graphs don't run
 * the simulation past visible benefit. Returns ReactFlow-shaped nodes
 * and edges with positions snapshotted from the simulation.
 *
 * Two node kinds (entity, article) and two edge kinds (co_mention,
 * mentions). Forces are tuned per edge kind so mentions pull articles
 * close to their entities while co_mention does the existing
 * weighted-distance layout between entities.
 *
 * Forces tuned to feel Obsidian-like:
 *   - co_mention link: distance shrinks with edge weight (stronger pairs = closer)
 *   - mentions link: shorter constant distance (article hugs its entities)
 *   - charge: -200 repulsion, capped at 400px so far nodes don't fight
 *   - collision: nodeSize + 20 keeps labels from overlapping
 *   - center: weak 0.05 pull toward (cx, cy) so the graph doesn't drift
 */
export function computeForceLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  options: LayoutOptions = {},
): Promise<LayoutResult> {
  const width = options.width ?? CANVAS_WIDTH;
  const height = options.height ?? CANVAS_HEIGHT;
  return new Promise((resolve) => {
    if (graphNodes.length === 0) {
      resolve({ rfNodes: [], rfEdges: [] });
      return;
    }

    // Mention-count statistics are computed over entity nodes ONLY —
    // article nodes don't have a mentionCount and shouldn't skew the
    // entity radius normalization.
    const entityMentionCounts = graphNodes
      .filter((n): n is Extract<GraphNode, { kind: 'entity' }> => n.kind === 'entity')
      .map((n) => n.mentionCount);
    const maxMentions = Math.max(...entityMentionCounts, 1);
    const allEqual =
      entityMentionCounts.length > 0 &&
      entityMentionCounts.every((c) => c === entityMentionCounts[0]);

    const simNodes: SimNode[] = graphNodes.map((node) => {
      // Random jitter around the center seeds the simulation with non-
      // pathological positions (all-at-origin makes the layout explode).
      const x = width / 2 + (Math.random() - 0.5) * 100;
      const y = height / 2 + (Math.random() - 0.5) * 100;

      if (node.kind === 'article') {
        // 'junk' shouldn't reach a processed-status graph response, but
        // we narrow to the two visual states ArticleNode handles.
        const importance: 'high' | 'normal' = node.importance === 'high' ? 'high' : 'normal';
        return {
          id: node.id,
          kind: 'article',
          x,
          y,
          label: node.title ?? '(untitled)',
          importance,
          nodeSize: ARTICLE_NODE_WIDTH,
        };
      }

      return {
        id: node.id,
        kind: 'entity',
        x,
        y,
        canonicalName: node.canonicalName,
        type: node.type,
        mentionCount: node.mentionCount,
        nodeSize: allEqual
          ? NODE_SIZE_MIN
          : NODE_SIZE_MIN + (node.mentionCount / maxMentions) * (NODE_SIZE_MAX - NODE_SIZE_MIN),
        // Always carry topCategory on the SimNode (cheap; might use
        // it later for force-clustering by category). Whether it gets
        // surfaced to EntityNode's render is gated by `colorBy`
        // below.
        topCategory: node.topCategory,
      };
    });

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    // `similar` edges are a visual-only overlay (semantic similarity
    // between two article bodies) — they don't drive node positions,
    // because we want the layout to reflect topology (co_mention +
    // mentions) rather than cluster-by-content. They still ship to
    // ReactFlow via rfEdges below; just not into the force sim.
    const simLinks: SimLink[] = graphEdges
      .filter((e) => e.kind !== 'similar' && nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        kind: e.kind as Exclude<typeof e.kind, 'similar'>,
      }));

    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          // mentions links pull articles close to their entities at a
          // shorter constant distance; co_mention keeps the existing
          // weighted-distance behaviour between entities.
          .distance((d) => (d.kind === 'mentions' ? 60 : Math.max(60, 120 / Math.sqrt(d.weight))))
          .strength((d) => (d.kind === 'mentions' ? 0.5 : 0.3)),
      )
      .force('charge', forceManyBody<SimNode>().strength(-200).distanceMax(400))
      .force('center', forceCenter<SimNode>(width / 2, height / 2).strength(0.05))
      .force(
        'collision',
        forceCollide<SimNode>()
          .radius((d) => d.nodeSize + 20)
          .strength(0.8),
      )
      .alphaDecay(0.02)
      .stop();

    // Synchronous tick loop. log(n)*50 reaches equilibrium for graphs
    // we expect at MVP scale; cap at 300 so the worst case is bounded.
    const ticks = Math.min(300, Math.ceil(Math.log(graphNodes.length + 1) * 50));
    simulation.tick(ticks);

    const rfNodes: Array<EntityRFNode | ArticleRFNode> = simNodes.map((n) => {
      const cx = n.x ?? width / 2;
      const cy = n.y ?? height / 2;

      if (n.kind === 'article') {
        const w = n.nodeSize;
        const h = n.nodeSize * ARTICLE_NODE_ASPECT;
        const data: ArticleNodeData = {
          label: n.label,
          importance: n.importance,
          nodeSize: n.nodeSize,
        };
        return {
          id: n.id,
          type: 'articleNode' as const,
          position: { x: cx - w / 2, y: cy - h / 2 },
          data,
          style: { width: w, height: h },
        };
      }

      // topCategory is always carried in data — GraphPage decides
      // (per its colorBy toggle) whether to strip it before handing
      // nodes to ReactFlow, which lets the toggle flip colors
      // without re-running the force simulation. EntityNode itself
      // stays dumb: it reads data.topCategory and tints, period.
      const data: EntityNodeData = {
        canonicalName: n.canonicalName,
        type: n.type,
        mentionCount: n.mentionCount,
        nodeSize: n.nodeSize,
      };
      if (n.topCategory) {
        data.topCategory = n.topCategory;
      }
      return {
        id: n.id,
        type: 'entityNode' as const,
        position: { x: cx - n.nodeSize / 2, y: cy - n.nodeSize / 2 },
        data,
        style: { width: n.nodeSize, height: n.nodeSize },
      };
    });

    const rfEdges: Edge[] = graphEdges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => {
        return {
          // Edge id includes the kind so a future change that lets the
          // same (source, target) pair carry both a co_mention and a
          // mentions edge doesn't collide. Today's data never does — a
          // co_mention is entity↔entity and a mention is article→entity
          // — but the cheap defensive prefix costs nothing.
          id: `${e.kind}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          type: 'straight',
          // Stash the edge kind on data so the Animate toggle in
          // GraphPage can branch without re-parsing the id prefix
          // (and so the same memo can swap source/target on co_mention
          // edges to make the animation flow old→new). data is an
          // arbitrary payload field react-flow ignores at the SVG
          // layer — same place we'd land cluster-id or
          // category-color metadata later.
          data: { kind: e.kind },
          style: styleForEdgeKind(e),
          focusable: false,
          selectable: false,
          animated: false,
        };
      });

    resolve({ rfNodes, rfEdges });
  });
}

// Per-kind edge styling. Extracted as a free function so the rfEdge
// builder above stays a flat map() — easier to add a fourth kind
// later (e.g. `cluster` for force-clustered layouts) without
// inflating the main loop.
function styleForEdgeKind(e: GraphEdge): Record<string, unknown> {
  const base: Record<string, unknown> = {
    // Edges never intercept pointer events — at dense edge counts
    // they otherwise swallow clicks/drags meant for the pane. Hover
    // highlighting is driven from node mouse events and toggles
    // classes on the cached edge elements directly.
    pointerEvents: 'none' as const,
  };
  if (e.kind === 'mentions') {
    return {
      ...base,
      // mentions: thin, muted, low opacity — they're abundant
      // (one per article-entity pair, ~5-15 per article) and
      // shouldn't overwhelm the co_mention skeleton.
      strokeWidth: 0.5,
      stroke: 'hsl(var(--muted-foreground) / 0.6)',
      opacity: 0.25,
    };
  }
  if (e.kind === 'similar') {
    return {
      ...base,
      // similar: dashed, green-tinted so they read as a distinct
      // edge species against the muted-grey co_mention / mentions
      // skeleton. Width slightly above mentions so the dashes are
      // readable but well below co_mention so the spine still
      // dominates the canvas.
      strokeWidth: 0.8,
      stroke: 'hsl(142 71% 45% / 0.55)',
      strokeDasharray: '4 3',
      opacity: 0.55,
    };
  }
  // co_mention: weighted thickness, more saturated.
  return {
    ...base,
    strokeWidth: Math.min(3, 0.5 + e.weight * 0.3),
    stroke: 'hsl(var(--muted-foreground))',
    opacity: 0.5,
  };
}

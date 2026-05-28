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
      }
    | {
        id: string;
        kind: 'article';
        label: string;
        importance: 'high' | 'normal';
        nodeSize: number;
      }
  );

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
  width: number = CANVAS_WIDTH,
  height: number = CANVAS_HEIGHT,
): Promise<LayoutResult> {
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
      };
    });

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = graphEdges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, weight: e.weight, kind: e.kind }));

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

      return {
        id: n.id,
        type: 'entityNode' as const,
        position: { x: cx - n.nodeSize / 2, y: cy - n.nodeSize / 2 },
        data: {
          canonicalName: n.canonicalName,
          type: n.type,
          mentionCount: n.mentionCount,
          nodeSize: n.nodeSize,
        },
        style: { width: n.nodeSize, height: n.nodeSize },
      };
    });

    const rfEdges: Edge[] = graphEdges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => {
        const isMention = e.kind === 'mentions';
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
          style: {
            // mentions: thin, muted, low opacity — they're abundant
            //   (one per article-entity pair, ~5-15 per article) and
            //   shouldn't overwhelm the co_mention skeleton.
            // co_mention: weighted thickness, more saturated.
            strokeWidth: isMention ? 0.5 : Math.min(3, 0.5 + e.weight * 0.3),
            stroke: isMention
              ? 'hsl(var(--muted-foreground) / 0.6)'
              : 'hsl(var(--muted-foreground))',
            opacity: isMention ? 0.25 : 0.5,
            // Edges never intercept pointer events — at dense edge
            // counts they otherwise swallow clicks/drags meant for the
            // pane. Hover highlighting is driven from node mouse events
            // and toggles classes on the cached edge elements directly,
            // so disabling pointer events on edges costs us nothing.
            pointerEvents: 'none' as const,
          },
          focusable: false,
          selectable: false,
          animated: false,
        };
      });

    resolve({ rfNodes, rfEdges });
  });
}

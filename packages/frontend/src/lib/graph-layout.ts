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
import type { EntityType } from './entities';
import type { GraphEdge, GraphNode } from './graph';

const NODE_SIZE_MIN = 12;
const NODE_SIZE_MAX = 48;
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
  rfNodes: EntityRFNode[];
  rfEdges: Edge[];
}

// d3-force mutates these nodes in place — x, y, vx, vy are assigned by
// the simulation. We carry the data we need to construct the ReactFlow
// node alongside the simulation fields so we don't have to look them
// up by id on the way out.
interface SimNode extends SimulationNodeDatum {
  id: string;
  canonicalName: string;
  type: EntityType;
  mentionCount: number;
  nodeSize: number;
}

type SimLink = SimulationLinkDatum<SimNode> & { weight: number };

/**
 * Run a d3-force simulation on the graph synchronously (no `.on('tick')`
 * — that would re-render React on every tick). 300 ticks at MVP scale
 * is enough to reach equilibrium for most graphs; we cap by
 * `log(n) * 50` so tiny graphs settle fast and huge graphs don't run
 * the simulation past visible benefit. Returns ReactFlow-shaped nodes
 * and edges with positions snapshotted from the simulation.
 *
 * Forces tuned to feel Obsidian-like:
 *   - link: distance shrinks with edge weight (stronger pairs = closer)
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

    const maxMentions = Math.max(...graphNodes.map((n) => n.mentionCount), 1);
    const allEqual = graphNodes.every((n) => n.mentionCount === graphNodes[0].mentionCount);

    const simNodes: SimNode[] = graphNodes.map((node) => ({
      id: node.id,
      // Random jitter around the center seeds the simulation with non-
      // pathological positions (all-at-origin makes the layout explode).
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
      canonicalName: node.canonicalName,
      type: node.type,
      mentionCount: node.mentionCount,
      nodeSize: allEqual
        ? NODE_SIZE_MIN
        : NODE_SIZE_MIN + (node.mentionCount / maxMentions) * (NODE_SIZE_MAX - NODE_SIZE_MIN),
    }));

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = graphEdges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, weight: e.weight }));

    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => Math.max(60, 120 / Math.sqrt(d.weight)))
          .strength(0.3),
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

    const rfNodes: EntityRFNode[] = simNodes.map((n) => {
      const cx = n.x ?? width / 2;
      const cy = n.y ?? height / 2;
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
      .map((e) => ({
        id: `${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        style: {
          strokeWidth: Math.min(3, 0.5 + e.weight * 0.3),
          stroke: 'hsl(var(--muted-foreground))',
          opacity: 0.6,
        },
        animated: false,
      }));

    resolve({ rfNodes, rfEdges });
  });
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background, ReactFlow, type Edge, type NodeTypes } from '@xyflow/react';
import { EntityNode } from '@/components/graph/EntityNode';
import type { EntityDetail, RelatedEntity } from '@/lib/entities';
import type { EntityGraphNode, GraphEdge } from '@/lib/graph';
import { computeForceLayout, type EntityRFNode } from '@/lib/graph-layout';

// Module-level so react-flow's shallow nodeTypes compare doesn't remount the
// custom node on every render (same reasoning as GraphPage).
const NODE_TYPES: NodeTypes = { entityNode: EntityNode };

interface Props {
  entity: EntityDetail;
}

// Build the entity-graph node shape `computeForceLayout` expects from the
// detail payload. Related entities don't carry first/last-seen or a real
// mention count, so we map coMentionCount → mentionCount (it drives node
// radius, which is exactly the "how related" signal we want) and stub the
// timestamp fields the force sim never reads in a static (non-animated) view.
function toGraphNode(
  id: string,
  canonicalName: string,
  type: EntityGraphNode['type'],
  mentionCount: number,
): EntityGraphNode {
  return {
    id,
    kind: 'entity',
    canonicalName,
    type,
    aliases: [],
    firstSeen: '',
    lastSeen: '',
    mentionCount,
    topCategory: null,
  };
}

/**
 * Read-only force-directed preview of an entity and the entities it's
 * co-mentioned with. Replaces the old vertical list in the entity sidebar
 * with the same react-flow + d3-force layout the Graph page uses, so the two
 * surfaces share node styling and the detail page reads as a teaser for the
 * full graph. Clicking a satellite node navigates to that entity.
 */
export function RelatedEntitiesGraph({ entity }: Props) {
  const navigate = useNavigate();

  // Build the node/edge set once per (entity, relatedEntities) change.
  const { nodes, edges } = useMemo(() => {
    const center = toGraphNode(entity.id, entity.canonicalName, entity.type, entity.mentionCount);
    const satellites = entity.relatedEntities.map((r: RelatedEntity) =>
      toGraphNode(r.id, r.canonicalName, r.type, r.coMentionCount),
    );
    const graphEdges: GraphEdge[] = entity.relatedEntities.map((r) => ({
      source: entity.id,
      target: r.id,
      weight: r.coMentionCount,
      kind: 'co_mention',
      minPublishedAt: null,
    }));
    return { nodes: [center, ...satellites], edges: graphEdges };
  }, [entity]);

  const [layoutNodes, setLayoutNodes] = useState<EntityRFNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<Edge[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Smaller canvas than the full Graph page so the preview settles compact.
    void computeForceLayout(nodes, edges, { width: 520, height: 300 }).then((result) => {
      if (cancelled) return;
      // Only entity nodes are produced here — narrow for the state setter.
      setLayoutNodes(result.rfNodes as EntityRFNode[]);
      setLayoutEdges(result.rfEdges);
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges]);

  return (
    <div className="h-[300px] overflow-hidden rounded-md border bg-background">
      <ReactFlow
        nodes={layoutNodes}
        edges={layoutEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_e, node) => {
          // The centre node is the current entity — clicking it is a no-op.
          if (node.id !== entity.id) navigate(`/entities/${node.id}`);
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={4}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        panOnDrag
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="hsl(var(--border))" />
      </ReactFlow>
    </div>
  );
}

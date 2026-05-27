import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background, Controls, MiniMap, ReactFlow, type Edge, type NodeTypes } from '@xyflow/react';
import { EntityNode } from '@/components/graph/EntityNode';
import { GraphFilterBar } from '@/components/graph/GraphFilterBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGraph } from '@/hooks/useGraph';
import { useGraphFilters } from '@/hooks/useGraphFilters';
import { computeForceLayout, type EntityNodeData, type EntityRFNode } from '@/lib/graph-layout';

// Module-level constant — react-flow shallow-compares nodeTypes and
// remounts custom nodes on every render if this is recreated inline.
const NODE_TYPES: NodeTypes = { entityNode: EntityNode };

// Hide minimap minor visual artifacts behind a typed shape so we don't
// reach into Edge's loosely-typed style object directly.
type StyledEdge = Edge;

function buildAdjacency(edges: Edge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  return adj;
}

export function GraphPage() {
  const navigate = useNavigate();
  const { filters, setFilter, reset, activeFilterCount } = useGraphFilters();
  const { data, isPending, error, refetch } = useGraph(filters);

  // On the user's first visit (no filters set), bias the URL to
  // minMentions=2 — without this the demo's ~280 single-mention
  // entities turn the canvas into a hairball. Empty deps array is
  // deliberate: this fires once on mount; we don't want it firing
  // again after the user clears the filter and the URL becomes
  // empty (which would immediately re-add minMentions=2 and fight
  // the user). The react-hooks/exhaustive-deps plugin isn't
  // registered in this project so no eslint-disable is needed.
  useEffect(() => {
    if (!filters.minMentions && !filters.type) {
      setFilter('minMentions', 2);
    }
  }, []);

  const [layoutNodes, setLayoutNodes] = useState<EntityRFNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<StyledEdge[]>([]);
  const [isLayouting, setIsLayouting] = useState(false);
  const layoutKey = useRef('');

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const adjacency = useMemo(() => buildAdjacency(layoutEdges), [layoutEdges]);

  // Run force layout when the node-set changes. The layoutKey ref
  // (sorted ids) guards against re-running when an unrelated re-render
  // happens with the same data, which would re-jitter every node.
  useEffect(() => {
    if (!data || data.nodes.length === 0) {
      layoutKey.current = '';
      setLayoutNodes([]);
      setLayoutEdges([]);
      return;
    }
    const key = [...data.nodes.map((n) => n.id)].sort().join(',');
    if (key === layoutKey.current) return;
    layoutKey.current = key;

    setIsLayouting(true);
    void computeForceLayout(data.nodes, data.edges).then(({ rfNodes, rfEdges }) => {
      setLayoutNodes(rfNodes);
      setLayoutEdges(rfEdges);
      setIsLayouting(false);
    });
  }, [data]);

  // Apply hover dimming to nodes. New objects every hover transition,
  // but only `data` differs — react-flow re-renders only the changed
  // nodes (it diffs by id + reference).
  const displayNodes = useMemo<EntityRFNode[]>(() => {
    if (!hoveredNodeId) return layoutNodes;
    const neighbors = adjacency.get(hoveredNodeId) ?? new Set<string>();
    return layoutNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isHighlighted: n.id === hoveredNodeId,
        isDimmed: n.id !== hoveredNodeId && !neighbors.has(n.id),
      },
    }));
  }, [layoutNodes, hoveredNodeId, adjacency]);

  // Apply hover dimming to edges. Default opacity 0.6 matches what the
  // layout step sets; on hover, connected edges go to 1, others to 0.05.
  const displayEdges = useMemo<StyledEdge[]>(() => {
    if (!hoveredNodeId) {
      return layoutEdges.map((e) => ({ ...e, style: { ...e.style, opacity: 0.6 } }));
    }
    return layoutEdges.map((e) => {
      const connected = e.source === hoveredNodeId || e.target === hoveredNodeId;
      return { ...e, style: { ...e.style, opacity: connected ? 1 : 0.05 } };
    });
  }, [layoutEdges, hoveredNodeId]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }): void => {
      navigate(`/entities/${node.id}`);
    },
    [navigate],
  );

  const onNodeMouseEnter = useCallback((_event: React.MouseEvent, node: { id: string }): void => {
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback((): void => {
    setHoveredNodeId(null);
  }, []);

  if (isPending || isLayouting) {
    return (
      <div className="space-y-4">
        <PageHeader />
        <div className="flex h-[700px] items-center justify-center rounded-lg border bg-muted/20">
          <div className="space-y-2 text-center">
            <div className="text-sm font-medium">
              {isPending ? 'Loading graph data…' : 'Calculating layout…'}
            </div>
            {isLayouting && (
              <div className="text-xs text-muted-foreground">
                Placing {data?.nodes.length ?? 0} nodes
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader />
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button variant="outline" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader />
        <GraphFilterBar
          filters={filters}
          setFilter={setFilter}
          reset={reset}
          activeFilterCount={activeFilterCount}
          nodeCount={0}
          edgeCount={0}
        />
        <Card>
          <CardHeader>
            <CardTitle>
              {activeFilterCount > 0 ? 'No entities match these filters' : 'No entities yet'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {activeFilterCount > 0
                ? 'Try removing some filters to see more entities.'
                : 'Add a feed and wait for articles to be processed — entities will appear here.'}
            </p>
            {activeFilterCount > 0 && (
              <Button variant="outline" onClick={reset}>
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader />
      <GraphFilterBar
        filters={filters}
        setFilter={setFilter}
        reset={reset}
        activeFilterCount={activeFilterCount}
        nodeCount={data.nodes.length}
        edgeCount={data.edges.length}
      />
      <div className="rounded-lg border bg-background" style={{ height: 700 }}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          // Permissive bounds — react-flow defaults to minZoom=0.5 /
          // maxZoom=2 even when the props are omitted; we set the
          // bounds wide enough that the user effectively zooms freely.
          minZoom={0.05}
          maxZoom={20}
          proOptions={{ hideAttribution: false }}
          nodesDraggable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={true}
        >
          <Background gap={20} color="hsl(var(--border))" />
          <Controls showZoom showFitView showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              const type = (node.data as EntityNodeData).type;
              const colors: Record<string, string> = {
                company: '#93c5fd',
                product: '#c4b5fd',
                person: '#86efac',
                technology: '#fdba74',
                location: '#fda4af',
              };
              return colors[type] ?? '#94a3b8';
            }}
            maskColor="hsl(var(--background) / 0.8)"
            className="rounded-md border"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Graph</h1>
      <p className="text-sm text-muted-foreground">
        Entity relationship graph. Hover a node to highlight its connections. Node size reflects
        mention count; edge weight reflects co-mention frequency.
      </p>
    </div>
  );
}

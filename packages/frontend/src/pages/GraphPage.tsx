import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background, Controls, ReactFlow, type Edge, type NodeTypes } from '@xyflow/react';
import { ArticleNode, type ArticleRFNode } from '@/components/graph/ArticleNode';
import { EntityNode } from '@/components/graph/EntityNode';
import { GraphFilterBar } from '@/components/graph/GraphFilterBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGraph } from '@/hooks/useGraph';
import { useGraphFilters } from '@/hooks/useGraphFilters';
import { computeForceLayout, type EntityRFNode } from '@/lib/graph-layout';

// Layout produces a union of node kinds; alias keeps the rest of this
// file readable without spelling out the union at every state
// declaration.
type RFNode = EntityRFNode | ArticleRFNode;

// Module-level constant — react-flow shallow-compares nodeTypes and
// remounts custom nodes on every render if this is recreated inline.
const NODE_TYPES: NodeTypes = { entityNode: EntityNode, articleNode: ArticleNode };

interface HoverIndex {
  neighbors: Map<string, Set<string>>;
  edges: Map<string, Set<string>>;
}

const EMPTY_HOVER_INDEX: HoverIndex = { neighbors: new Map(), edges: new Map() };

// Walk edges once to build per-node lookups for both neighbour ids and
// connected edge ids. Cheap (O(E)) and we hand off to a ref, so this
// never causes a React re-render on its own.
function buildHoverIndex(edges: Edge[]): HoverIndex {
  const neighbors = new Map<string, Set<string>>();
  const connectedEdges = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!neighbors.has(e.source)) neighbors.set(e.source, new Set());
    if (!neighbors.has(e.target)) neighbors.set(e.target, new Set());
    neighbors.get(e.source)?.add(e.target);
    neighbors.get(e.target)?.add(e.source);

    if (!connectedEdges.has(e.source)) connectedEdges.set(e.source, new Set());
    if (!connectedEdges.has(e.target)) connectedEdges.set(e.target, new Set());
    connectedEdges.get(e.source)?.add(e.id);
    connectedEdges.get(e.target)?.add(e.id);
  }
  return { neighbors, edges: connectedEdges };
}

export function GraphPage() {
  const navigate = useNavigate();
  const { filters, setFilter, reset, activeFilterCount } = useGraphFilters();
  const { data, isPending, error, refetch } = useGraph(filters);

  // On the user's first visit (no filters set), bias the URL to
  // minMentions=2 — without this the demo's ~280 single-mention
  // entities turn the canvas into a hairball. Mount-only deps so
  // clearing the filter doesn't immediately re-add it.
  useEffect(() => {
    if (!filters.minMentions && !filters.type) {
      setFilter('minMentions', 2);
    }
  }, []);

  const [layoutNodes, setLayoutNodes] = useState<RFNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<Edge[]>([]);
  const [isLayouting, setIsLayouting] = useState(false);
  const layoutKey = useRef('');

  // Hover state lives in refs, not React state. The DOM is the source of
  // truth during a hover — onNodeMouseEnter toggles classList directly
  // on the rendered .react-flow__node and .react-flow__edge elements
  // and React never re-renders. This is what makes the highlight feel
  // instant even with 50+ nodes / 60+ edges on screen.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverIndexRef = useRef<HoverIndex>(EMPTY_HOVER_INDEX);

  // Pre-built DOM element lookups. Built once after react-flow mounts
  // the rendered nodes/edges (one `setTimeout` past `layoutNodes`
  // becoming non-empty), and re-built whenever the layout changes.
  // Per-hover cost is then just Map iteration with direct element
  // refs — zero querySelectorAll on the hot path. We cache both the
  // wrapper (`.react-flow__node`, for dim) and the inner circle
  // (`.entity-node-circle`, for the highlight ring) so the hover loop
  // touches no DOM lookups at all.
  const domCacheRef = useRef<{
    nodes: Map<string, { wrapper: HTMLElement; circle: HTMLElement | null }>;
    edges: Map<string, HTMLElement>;
  } | null>(null);

  useEffect(() => {
    hoverIndexRef.current = buildHoverIndex(layoutEdges);
  }, [layoutEdges]);

  useEffect(() => {
    if (layoutNodes.length === 0) {
      domCacheRef.current = null;
      return;
    }
    // ReactFlow needs a frame (or two) after layoutNodes change to
    // mount the new nodes into the DOM. 100ms is comfortable on the
    // demo's data; if it ever needs to be tighter we can switch to a
    // ResizeObserver-based readiness probe.
    const handle = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const nodes = new Map<string, { wrapper: HTMLElement; circle: HTMLElement | null }>();
      const edges = new Map<string, HTMLElement>();
      container.querySelectorAll<HTMLElement>('.react-flow__node[data-id]').forEach((el) => {
        const id = el.getAttribute('data-id');
        if (id) {
          nodes.set(id, {
            wrapper: el,
            circle: el.querySelector<HTMLElement>('.entity-node-circle'),
          });
        }
      });
      container.querySelectorAll<HTMLElement>('.react-flow__edge[data-id]').forEach((el) => {
        const id = el.getAttribute('data-id');
        if (id) edges.set(id, el);
      });
      domCacheRef.current = { nodes, edges };
    }, 100);
    return () => clearTimeout(handle);
  }, [layoutNodes, layoutEdges]);

  // Force layout when the node-set changes. layoutKey (sorted ids)
  // skips re-layout when an unrelated re-render arrives with the same
  // data, so positions don't re-jitter.
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

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string; type?: string }): void => {
      // node.type is the react-flow node type — 'articleNode' or
      // 'entityNode' — set by computeForceLayout. We route by kind so
      // each surface lands on its canonical detail page.
      if (node.type === 'articleNode') {
        navigate(`/articles/${node.id}`);
      } else {
        navigate(`/entities/${node.id}`);
      }
    },
    [navigate],
  );

  // Pure DOM work using the pre-built cache — no querySelectorAll on
  // the hot path. The dim/un-dim classes go on the .react-flow__node
  // wrapper (controls opacity for the whole node + label); the
  // highlight ring goes on the inner .entity-node-circle so the
  // box-shadow follows the circle's border-radius and renders round.
  // Empty deps — both handlers only touch refs.
  const onNodeMouseEnter = useCallback((_event: React.MouseEvent, node: { id: string }): void => {
    const cache = domCacheRef.current;
    if (!cache) return;
    const { neighbors, edges } = hoverIndexRef.current;
    const neighborSet = neighbors.get(node.id) ?? new Set<string>();
    const edgeSet = edges.get(node.id) ?? new Set<string>();

    cache.nodes.forEach(({ wrapper, circle }, id) => {
      if (id === node.id) {
        wrapper.classList.remove('graph-dimmed');
        circle?.classList.add('graph-highlighted');
      } else if (neighborSet.has(id)) {
        wrapper.classList.remove('graph-dimmed');
        circle?.classList.remove('graph-highlighted');
      } else {
        wrapper.classList.add('graph-dimmed');
        circle?.classList.remove('graph-highlighted');
      }
    });
    cache.edges.forEach((el, id) => {
      if (edgeSet.has(id)) {
        el.classList.remove('graph-edge-dimmed');
      } else {
        el.classList.add('graph-edge-dimmed');
      }
    });
  }, []);

  const onNodeMouseLeave = useCallback((): void => {
    const cache = domCacheRef.current;
    if (!cache) return;
    cache.nodes.forEach(({ wrapper, circle }) => {
      wrapper.classList.remove('graph-dimmed');
      circle?.classList.remove('graph-highlighted');
    });
    cache.edges.forEach((el) => {
      el.classList.remove('graph-edge-dimmed');
    });
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
          entityCount={0}
          articleCount={0}
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
        entityCount={data.nodes.filter((n) => n.kind === 'entity').length}
        articleCount={data.nodes.filter((n) => n.kind === 'article').length}
        edgeCount={data.edges.length}
      />
      <div ref={containerRef} className="rounded-lg border bg-background" style={{ height: 700 }}>
        <ReactFlow
          nodes={layoutNodes}
          edges={layoutEdges}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          // Cursor leaving the canvas entirely also clears the highlight
          // — without this, a fast exit off the right edge of the pane
          // can leave the last hovered node stuck in graph-highlighted.
          onPaneMouseLeave={onNodeMouseLeave}
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
          // Disable focus on nodes/edges so ReactFlow doesn't paint its
          // default focus outline (which renders as a rectangle on the
          // .react-flow__node wrapper — ugly given our nodes are round).
          // We don't ship keyboard graph navigation in this milestone,
          // so disabling focus has no UX cost. Edges are also non-
          // reconnectable: this is a read-only view of co-mention
          // structure, not an editor.
          nodesFocusable={false}
          edgesFocusable={false}
          edgesReconnectable={false}
        >
          <Background gap={20} color="hsl(var(--border))" />
          <Controls showZoom showFitView showInteractive={false} />
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

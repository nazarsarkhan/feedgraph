import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Background,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { ArticleNode, type ArticleRFNode } from '@/components/graph/ArticleNode';
import { EntityNode } from '@/components/graph/EntityNode';
import { GraphFilterBar } from '@/components/graph/GraphFilterBar';
import { GraphTimeline } from '@/components/graph/GraphTimeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGraph } from '@/hooks/useGraph';
import { useGraphFilters } from '@/hooks/useGraphFilters';
import { computeExportSize, injectSvgBackground } from '@/lib/graph-export';
import { computeForceLayout, type EntityRFNode } from '@/lib/graph-layout';
import { computeTimelineRange, filterGraphAtTime, type TimelineRange } from '@/lib/graph-timeline';

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

// The page is wrapped in a ReactFlowProvider (see GraphPage below) so the
// export handler can read the react-flow instance via useReactFlow() — its
// getNodes() returns nodes with *measured* dimensions, which getNodesBounds
// needs to compute an accurate full-graph bounding box.
function GraphPageInner() {
  const navigate = useNavigate();
  const { getNodes } = useReactFlow();
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

  // Timeline state. Local (not URL) — the slider position is an
  // ephemeral UI mode, same reasoning as the dashboard period
  // selector. A bookmarked `?timeline=true&t=…` would surface a
  // frozen-in-time view the next visitor likely didn't intend.
  const [timelineActive, setTimelineActive] = useState(false);
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // View-mode mapping over layoutNodes. computeForceLayout always
  // includes topCategory in the entity node data so the force
  // simulation runs once per node-set; here we strip it in 'type'
  // mode so EntityNode falls back to the type palette. Toggling
  // colorBy therefore re-tints instantly without re-laying out
  // (which would jiggle every node's position).
  const colorBy = filters.colorBy ?? 'type';
  const layoutNodesView = useMemo(() => {
    if (colorBy === 'category') return layoutNodes;
    return layoutNodes.map((n) => {
      if (n.type !== 'entityNode' || n.data.topCategory === undefined) return n;
      // Shallow-copy data and drop topCategory so EntityNode falls
      // back to its type palette (it checks `data.topCategory` and
      // tints categorically when set).
      const nextData = { ...n.data };
      delete nextData.topCategory;
      return { ...n, data: nextData };
    });
  }, [layoutNodes, colorBy]);

  // Distinct category names in the currently-laid-out entity set —
  // drives the legend below the filter bar. Memoized off layoutNodes
  // so the bar doesn't recompute on every render.
  const categoriesInGraph = useMemo(() => {
    const set = new Set<string>();
    for (const n of layoutNodes) {
      if (n.type === 'entityNode' && n.data.topCategory) set.add(n.data.topCategory);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [layoutNodes]);

  // Animated-edges view. When `filters.animate` is on, co_mention
  // edges get the react-flow dashed-flow animation plus an arrow
  // marker; their source/target are reversed when the recorded
  // direction would animate new→old (we want old→new). ISO 8601
  // string comparison is the same as Date comparison when both are
  // UTC, which our backend guarantees — saves a Date.parse per edge.
  //
  // mentions edges stay untouched: they're inherently directional
  // (article → entity) and animating them clutters the canvas without
  // adding signal.
  //
  // Memoized off layoutEdges + the API node data so toggling animate
  // re-runs only this map, not the force simulation. data is the
  // useGraph response — falsy during loading.
  // Timeline range — computed from the raw API response (not from
  // layoutNodes) so it's stable across layout re-runs.
  const timelineRange = useMemo<TimelineRange | null>(() => {
    if (!data?.nodes) return null;
    return computeTimelineRange(data.nodes);
  }, [data]);

  // Snap the slider to `max` whenever the timeline activates so the
  // first view is "everything shown" instead of an arbitrary mid
  // point. Also re-snap when the range itself shifts (new data
  // arrives) so the slider never lands outside the legal range.
  useEffect(() => {
    if (timelineActive && timelineRange) {
      setSliderValue(timelineRange.max);
    }
  }, [timelineActive, timelineRange]);

  // Clear the play interval on unmount so the timer can't keep
  // ticking after the page is gone.
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, []);

  const stopPlayback = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Play: scrub from current slider position (or from min if already
  // at max) up to max over ~10s, 100ms per step. setInterval is the
  // right tool here — requestAnimationFrame would give us 60fps,
  // which is way more granular than the user can perceive in a
  // node-set change, and would cost re-renders we don't need.
  const handlePlay = useCallback(() => {
    if (!timelineRange) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }
    const PLAY_DURATION_MS = 10_000;
    const STEPS = 100;
    const stepMs = PLAY_DURATION_MS / STEPS;
    const stepSize = (timelineRange.max - timelineRange.min) / STEPS;

    // Restart from min when the user hits Play at the end of the
    // track — natural "rewind on replay" UX.
    setSliderValue((prev) => (prev >= timelineRange.max ? timelineRange.min : prev));
    setIsPlaying(true);
    playIntervalRef.current = setInterval(() => {
      setSliderValue((prev) => {
        const next = prev + stepSize;
        if (next >= timelineRange.max) {
          if (playIntervalRef.current) {
            clearInterval(playIntervalRef.current);
            playIntervalRef.current = null;
          }
          setIsPlaying(false);
          return timelineRange.max;
        }
        return next;
      });
    }, stepMs);
  }, [isPlaying, stopPlayback, timelineRange]);

  // Pre-compute which node/edge ids survive at the current slider
  // position. Pulled out of the two memos below so we walk the
  // graph data once per scrub instead of twice.
  const timelineFilter = useMemo(() => {
    if (!timelineActive || !timelineRange || !data) return null;
    const filtered = filterGraphAtTime(data.nodes, data.edges, sliderValue);
    return {
      nodeIds: new Set(filtered.nodes.map((n) => n.id)),
      edgeKeys: new Set(filtered.edges.map((e) => `${e.kind}-${e.source}-${e.target}`)),
      nodeCount: filtered.nodes.length,
      edgeCount: filtered.edges.length,
    };
  }, [timelineActive, timelineRange, data, sliderValue]);

  const displayEdges = useMemo<Edge[]>(() => {
    if (!filters.animate) return layoutEdges;
    const firstSeenById = new Map<string, string>();
    for (const n of data?.nodes ?? []) {
      if (n.kind === 'entity' && n.firstSeen) firstSeenById.set(n.id, n.firstSeen);
    }
    return layoutEdges.map((edge) => {
      const kind = (edge.data as { kind?: string } | undefined)?.kind;
      if (kind !== 'co_mention') return edge;
      const sourceTs = firstSeenById.get(edge.source);
      const targetTs = firstSeenById.get(edge.target);
      let { source, target } = edge;
      if (sourceTs && targetTs && sourceTs > targetTs) {
        // Source was seen after target — swap so the animation flows
        // old → new (the older entity is the conceptual "origin" of
        // the co-mention spread).
        source = edge.target;
        target = edge.source;
      }
      return {
        ...edge,
        source,
        target,
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 8,
          height: 8,
          color: 'hsl(var(--muted-foreground))',
        },
      };
    });
  }, [layoutEdges, filters.animate, data]);

  // Timeline-filtered views. When timeline mode is off these are
  // straight pass-throughs (no extra `.filter()` walks). When on, we
  // gate each layoutNode/displayEdge on the precomputed
  // timelineFilter sets so the work is O(layoutNodes + displayEdges)
  // per scrub — no re-fetch, no re-simulation.
  const timelineDisplayNodes = useMemo<RFNode[]>(() => {
    if (!timelineFilter) return layoutNodesView;
    return layoutNodesView.filter((n) => timelineFilter.nodeIds.has(n.id));
  }, [layoutNodesView, timelineFilter]);

  const timelineDisplayEdges = useMemo<Edge[]>(() => {
    if (!timelineFilter) return displayEdges;
    // Each rfEdge's id is `${kind}-${source}-${target}` in the original
    // (pre-animate-swap) direction — so even when displayEdges flipped
    // source/target for the animate flow, the id still matches the
    // key we built from the API edges in timelineFilter.
    return displayEdges.filter((e) => e.id && timelineFilter.edgeKeys.has(e.id));
  }, [displayEdges, timelineFilter]);

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

  // Export the ENTIRE graph (not just the on-screen viewport) at high
  // resolution, as PNG or SVG. Follows react-flow's official
  // download-image pattern: compute the bounding box of all nodes, derive
  // a target image size + the viewport transform that fits the whole
  // graph into it, then rasterize the `.react-flow__viewport` element
  // under that transform — so the user's current pan/zoom is irrelevant
  // to the output. The filter strips react-flow's Controls / MiniMap /
  // attribution so the export is just the graph.
  const exportGraph = useCallback(
    async (format: 'png' | 'svg'): Promise<void> => {
      const container = containerRef.current;
      if (!container) return;
      // The viewport is the transformed layer that holds the nodes+edges;
      // capturing IT (not the wrapper) is what lets us override the
      // transform to frame the whole graph.
      const viewportEl = container.querySelector<HTMLElement>('.react-flow__viewport');
      if (!viewportEl) return;

      // getNodes() returns internal nodes carrying measured width/height,
      // so the bounds (and therefore the framing) include each node's
      // full footprint, not just its top-left position.
      const nodes = getNodes();
      if (nodes.length === 0) return;

      try {
        const bounds = getNodesBounds(nodes);
        const { imageWidth, imageHeight, pixelRatio } = computeExportSize(bounds);
        // Fit the full bounds into the target size. minZoom/maxZoom match
        // the canvas's permissive bounds; padding 0.1 leaves an even
        // margin so edge nodes/labels aren't clipped. Because the target
        // size already matches the bounds' aspect ratio, this padding is
        // the only whitespace in the output.
        const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.05, 20, 0.1);

        const options = {
          // MUST be a concrete color, not a CSS var. html-to-image fills
          // the canvas via `ctx.fillStyle = backgroundColor` — `hsl(var(…))`
          // is invalid as a canvas fillStyle, so the assignment is a no-op
          // and fillStyle stays at its default #000000, painting the whole
          // export black wherever the content doesn't cover it. White to
          // match the app's light background.
          backgroundColor: '#ffffff',
          width: imageWidth,
          height: imageHeight,
          filter: (node: HTMLElement) => {
            if (node instanceof Element) {
              if (node.classList.contains('react-flow__controls')) return false;
              if (node.classList.contains('react-flow__minimap')) return false;
              if (node.classList.contains('react-flow__attribution')) return false;
            }
            return true;
          },
          style: {
            width: `${imageWidth}px`,
            height: `${imageHeight}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            // react-flow's getViewportForBounds returns a transform that
            // assumes a top-left origin (that's what .react-flow__viewport
            // uses live). Pin it explicitly so the cloned element scales
            // from 0,0 — otherwise it scales about its centre and the graph
            // squeezes into a corner.
            transformOrigin: '0 0',
          },
        };

        // SVG is vector — it zooms losslessly, so no pixelRatio. NOTE on
        // SVG fidelity: our nodes are HTML (EntityNode/ArticleNode with
        // Tailwind classes), which html-to-image serializes into the SVG
        // via <foreignObject> with the computed styles inlined. Verified
        // by opening an exported .svg standalone — node circles, type
        // colors, and labels all render (the inlined styles survive,
        // because html-to-image embeds the resolved CSS rather than
        // relying on the page's stylesheet). If a future Tailwind/build
        // change ever breaks that, the symptom is a blank/again-unstyled
        // SVG — re-verify standalone before shipping a change here.
        const dataUrl =
          format === 'svg'
            ? // toSvg leaves the canvas outside the captured element box
              // transparent; force a uniform white background to match PNG.
              injectSvgBackground(await toSvg(viewportEl, options), '#ffffff')
            : await toPng(viewportEl, { ...options, pixelRatio });

        const link = document.createElement('a');
        link.download = `feedgraph-${new Date().toISOString().slice(0, 10)}.${format}`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        // html-to-image throws on a handful of edge cases — cross-origin
        // backgrounds, taint from a previously-failed image, etc. None
        // are recoverable in-place, so we surface a single toast and log
        // the error for diagnosis.
        console.error('Graph export failed:', err);
        toast.error('Export failed. Try zooming out first.');
      }
    },
    [getNodes],
  );

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
          categoriesInGraph={[]}
          timelineActive={false}
          onTimelineToggle={() => undefined}
          timelineAvailable={false}
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
      <PageHeader
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportGraph('png')}
              disabled={layoutNodes.length === 0}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportGraph('svg')}
              disabled={layoutNodes.length === 0}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export SVG
            </Button>
          </div>
        }
      />
      <GraphFilterBar
        filters={filters}
        setFilter={setFilter}
        reset={reset}
        activeFilterCount={activeFilterCount}
        entityCount={data.nodes.filter((n) => n.kind === 'entity').length}
        articleCount={data.nodes.filter((n) => n.kind === 'article').length}
        edgeCount={data.edges.length}
        categoriesInGraph={categoriesInGraph}
        timelineActive={timelineActive}
        onTimelineToggle={() => {
          // Toggle off: stop playback so a paused interval doesn't
          // resume on the next activation.
          if (timelineActive) stopPlayback();
          setTimelineActive((v) => !v);
        }}
        timelineAvailable={timelineRange !== null}
      />
      {timelineActive && timelineRange && (
        <GraphTimeline
          range={timelineRange}
          value={sliderValue}
          isPlaying={isPlaying}
          onValueChange={(v) => {
            // Scrubbing pauses any active playback so the user's
            // manual position isn't overwritten by the timer's next
            // step.
            if (isPlaying) stopPlayback();
            setSliderValue(v);
          }}
          onPlay={handlePlay}
          onReset={() => {
            stopPlayback();
            setSliderValue(timelineRange.max);
          }}
          nodeCount={timelineFilter?.nodeCount ?? 0}
          edgeCount={timelineFilter?.edgeCount ?? 0}
        />
      )}
      <div ref={containerRef} className="rounded-lg border bg-background" style={{ height: 700 }}>
        <ReactFlow
          nodes={timelineDisplayNodes}
          edges={timelineDisplayEdges}
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

// Provider wrapper so GraphPageInner's export handler can reach the
// react-flow instance via useReactFlow(). The <ReactFlow> it renders
// binds to this same provider, so getNodes() sees the live, measured
// node set.
export function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphPageInner />
    </ReactFlowProvider>
  );
}

function PageHeader({ action }: { action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Graph</h1>
        <p className="text-sm text-muted-foreground">
          Entity relationship graph. Hover a node to highlight its connections. Node size reflects
          mention count; edge weight reflects co-mention frequency.
        </p>
      </div>
      {action}
    </div>
  );
}

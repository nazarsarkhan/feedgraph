import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background, Controls, ReactFlow, type NodeTypes } from '@xyflow/react';
import { EntityNode } from '@/components/graph/EntityNode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGraph } from '@/hooks/useGraph';
import { buildReactFlowEdges, buildReactFlowNodes } from '@/lib/graph-layout';

// Module-level constant. ReactFlow's nodeTypes prop is shallow-compared
// on every render; passing a fresh object literal each render triggers
// an infinite update loop and a console warning. Defining it once
// outside the component is the official escape hatch.
const NODE_TYPES: NodeTypes = { entityNode: EntityNode };

export function GraphPage() {
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useGraph();

  const rfNodes = useMemo(() => (data ? buildReactFlowNodes(data.nodes) : []), [data]);
  const rfEdges = useMemo(() => (data ? buildReactFlowEdges(data.edges) : []), [data]);

  // v12 doesn't ship a generic NodeMouseHandler<TData>; the public
  // signature is (event, node) => void. We only need the id.
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }): void => {
      navigate(`/entities/${node.id}`);
    },
    [navigate],
  );

  if (isPending) return <LoadingState />;

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

  if (data.nodes.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader />
        <Card>
          <CardHeader>
            <CardTitle>No entities yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Add a feed and wait for articles to be processed — entities will appear here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader />
      <div className="rounded-lg border bg-background" style={{ height: 600 }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={16} color="hsl(var(--border))" />
          <Controls />
        </ReactFlow>
      </div>
      <p className="text-xs text-muted-foreground">
        {data.nodes.length} entities &middot; {data.edges.length} co-mention relationships. Click
        any node to open the entity detail page.
      </p>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Graph</h1>
      <p className="text-sm text-muted-foreground">
        Entity relationship graph. Node size reflects mention count; edge weight reflects co-mention
        frequency.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <PageHeader />
      <div className="h-[600px] animate-pulse rounded-lg border bg-muted/20" />
    </div>
  );
}

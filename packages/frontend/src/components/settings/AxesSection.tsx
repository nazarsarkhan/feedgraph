import { AxisCard } from '@/components/settings/AxisCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAxes } from '@/hooks/useAxes';

export function AxesSection() {
  const { data: axes, isPending, error, refetch } = useAxes();

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Axes</h2>
        <p className="text-sm text-muted-foreground">
          Axes define the classification dimensions applied by the LLM to each article.
        </p>
      </div>

      {isPending && <SkeletonGrid />}

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Could not load axes</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {axes && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {axes.map((a) => (
            <AxisCard key={a.id} axis={a} />
          ))}
        </div>
      )}
    </section>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

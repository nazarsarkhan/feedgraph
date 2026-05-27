import { Navigate, Outlet } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/hooks/useMe';

// Module-level so React doesn't recreate the JSX on every ProtectedRoute
// render — the loading view is identical for every visit.
const LOADING_VIEW = (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="flex w-72 flex-col gap-3" aria-busy="true" aria-live="polite">
      <div className="h-4 animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  </div>
);

export function ProtectedRoute() {
  const me = useMe();

  if (me.isLoading) return LOADING_VIEW;

  if (me.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{me.error.message}</p>
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => me.refetch()}
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (me.data === null) return <Navigate to="/login" replace />;

  return <Outlet />;
}

import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { EntityDetailSidebar } from '@/components/entities/EntityDetailSidebar';
import { EntityTypeBadge } from '@/components/entities/EntityTypeBadge';
import { MentionTimelineChart } from '@/components/entities/MentionTimelineChart';
import { MentioningArticlesList } from '@/components/entities/MentioningArticlesList';
import { RelatedEntitiesGraph } from '@/components/entities/RelatedEntitiesGraph';
import { DetailLayout } from '@/components/layout/DetailLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEntity } from '@/hooks/useEntity';
import { ApiException } from '@/lib/api';

function BackLink() {
  return (
    <Link
      to="/entities"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Entities
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <BackLink />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="h-8 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-40 animate-pulse rounded bg-muted" />
          <div className="space-y-2">
            <div className="h-12 animate-pulse rounded bg-muted" />
            <div className="h-12 animate-pulse rounded bg-muted" />
            <div className="h-12 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-6 w-full animate-pulse rounded bg-muted" />
          <div className="h-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function NotFoundCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entity not found</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          We couldn&apos;t find that entity. It may have been removed or you may not have access to
          it.
        </p>
        <Button asChild variant="outline">
          <Link to="/entities">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to entities
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Couldn&apos;t load this entity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useEntity(id);

  if (query.isPending) return <LoadingState />;

  if (query.error) {
    if (query.error instanceof ApiException && query.error.status === 404) {
      return (
        <div className="space-y-4">
          <BackLink />
          <NotFoundCard />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorCard message={query.error.message} onRetry={() => query.refetch()} />
      </div>
    );
  }

  const entity = query.data;

  return (
    <DetailLayout
      backTo="/entities"
      backLabel="Entities"
      sidebar={<EntityDetailSidebar entity={entity} />}
    >
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold leading-tight">{entity.canonicalName}</h1>
        <EntityTypeBadge type={entity.type} />
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Mention activity</h2>
        <MentionTimelineChart data={entity.mentionTimeline} />
      </section>

      {entity.relatedEntities.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">
            Related entities <span className="text-muted-foreground">(co-mentions)</span>
          </h2>
          <RelatedEntitiesGraph entity={entity} />
        </section>
      )}

      <MentioningArticlesList entityId={entity.id} articles={entity.mentioningArticles} />
    </DetailLayout>
  );
}

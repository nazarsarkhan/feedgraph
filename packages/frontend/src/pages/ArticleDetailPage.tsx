import { Link, useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, ExternalLink, Layers } from 'lucide-react';
import { ArticleContent } from '@/components/articles/ArticleContent';
import { ArticleSidebar } from '@/components/articles/ArticleSidebar';
import { SimilarArticlesSection } from '@/components/articles/SimilarArticlesSection';
import { DetailLayout } from '@/components/layout/DetailLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useArticle } from '@/hooks/useArticle';
import { ApiException } from '@/lib/api';
import type { ArticleDetail } from '@/lib/articles';
import { formatAbsolute } from '@/lib/timezone';

const STATUS_LABEL = {
  raw: 'Raw',
  filtered: 'Filtered',
  pending_llm: 'Pending',
  processed: 'Processed',
  error: 'Error',
} as const;

const STATUS_VARIANT = {
  raw: 'secondary',
  filtered: 'secondary',
  pending_llm: 'secondary',
  processed: 'success',
  error: 'destructive',
} as const;

function BackLink() {
  return (
    <Link
      to="/articles"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Articles
    </Link>
  );
}

function MetaLine({ article }: { article: ArticleDetail }) {
  const date = article.publishedAt ?? article.createdAt;
  const relative = formatDistanceToNow(new Date(date), { addSuffix: true });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {article.feedName && <span>{article.feedName}</span>}
      <span title={formatAbsolute(date)}>{relative}</span>
      {article.author && <span>by {article.author}</span>}
      {article.similarCount > 0 && (
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3 w-3" />
          {article.similarCount} similar
        </span>
      )}
      {article.status !== 'processed' && (
        <Badge variant={STATUS_VARIANT[article.status]}>{STATUS_LABEL[article.status]}</Badge>
      )}
    </div>
  );
}

function ReadOriginalLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      Read original
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <BackLink />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-20 animate-pulse rounded bg-muted" />
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-6 w-full animate-pulse rounded bg-muted" />
          <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function NotFoundCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Article not found</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          We couldn&apos;t find the article you&apos;re looking for. It may have been removed or you
          may not have access to it.
        </p>
        <Button asChild variant="outline">
          <Link to="/articles">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to articles
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
        <CardTitle>Couldn&apos;t load this article</CardTitle>
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

export function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useArticle(id);

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

  const article = query.data;

  return (
    <DetailLayout
      backTo="/articles"
      backLabel="Articles"
      sidebar={<ArticleSidebar article={article} />}
    >
      <article className="space-y-6">
        <header className="space-y-3">
          <MetaLine article={article} />
          <div className="flex flex-wrap items-start gap-2">
            {article.importance === 'high' && <Badge className="mt-1">High</Badge>}
            <h1 className="text-2xl font-bold leading-tight">{article.title ?? '(untitled)'}</h1>
          </div>
        </header>

        {article.status === 'processed' && (
          <>
            {article.summary && (
              <div className="rounded-md border-l-2 border-primary bg-accent/30 p-4 text-sm leading-relaxed">
                {article.summary}
              </div>
            )}
            <ReadOriginalLink url={article.url} />
            {article.contentRaw && (
              <div className="border-t pt-6">
                <ArticleContent html={article.contentRaw} />
              </div>
            )}
            <SimilarArticlesSection
              articleId={article.id}
              similarArticles={article.similarArticles}
              totalCount={article.similarCount}
            />
          </>
        )}

        {article.status === 'filtered' && (
          <>
            <div className="rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm">
              <span className="font-medium">Filtered:</span>{' '}
              <code className="text-muted-foreground">{article.filterReason ?? 'unknown'}</code>
            </div>
            <ReadOriginalLink url={article.url} />
            {article.contentRaw && (
              <div className="border-t pt-6">
                <ArticleContent html={article.contentRaw} />
              </div>
            )}
          </>
        )}

        {article.status === 'pending_llm' && (
          <>
            <div className="rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm italic text-muted-foreground">
              Awaiting analysis…
            </div>
            <ReadOriginalLink url={article.url} />
            {article.contentRaw && (
              <div className="border-t pt-6">
                <ArticleContent html={article.contentRaw} />
              </div>
            )}
          </>
        )}

        {article.status === 'error' && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            <span className="font-medium">Processing error.</span>{' '}
            <span className="text-muted-foreground">
              {article.filterReason ?? 'Article could not be processed.'}
            </span>
          </div>
        )}

        {article.status === 'raw' && (
          <>
            <div className="rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm italic text-muted-foreground">
              Queued for prefilter.
            </div>
            <ReadOriginalLink url={article.url} />
          </>
        )}
      </article>
    </DetailLayout>
  );
}

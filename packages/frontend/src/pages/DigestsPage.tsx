import { useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { DigestCard } from '@/components/digests/DigestCard';
import { GenerateDigestDialog } from '@/components/digests/GenerateDigestDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDigests } from '@/hooks/useDigests';

export function DigestsPage() {
  const [generateOpen, setGenerateOpen] = useState(false);
  const { data, isPending, error, refetch } = useDigests();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Digests</h1>
          <p className="text-sm text-muted-foreground">
            AI-generated period summaries — pick a day, week, or month and synthesize what happened
            across your feeds.
          </p>
        </div>
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Generate digest
        </Button>
      </div>

      {isPending && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading digests…
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-destructive">{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!isPending && !error && data && data.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              No digests yet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Generate your first digest. Pick a day, week, or month with processed articles and
              we'll synthesize the developments into an executive summary plus key themes,
              sentiment, and top entities.
            </p>
            <Button variant="outline" onClick={() => setGenerateOpen(true)}>
              Generate digest
            </Button>
          </CardContent>
        </Card>
      )}

      {!isPending && !error && data && data.length > 0 && (
        <div className="space-y-4">
          {data.map((d) => (
            <DigestCard key={d.id} digest={d} />
          ))}
        </div>
      )}

      <GenerateDigestDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  );
}

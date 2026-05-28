import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiException } from '@/lib/api';
import { articlesApi, type EmbedResult } from '@/lib/articles';

export function EmbedSection() {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const embed = useMutation<EmbedResult, ApiException, void>({
    mutationFn: articlesApi.embed,
    onSuccess: async (data) => {
      // Invalidate the graph so the next visit re-fetches and surfaces
      // the new `similar` edges. Articles list and entity counts are
      // untouched by embedding, so we don't need to bust those caches.
      await queryClient.invalidateQueries({ queryKey: ['graph'] });
      if (data.embedded === 0 && data.errors === 0) {
        toast.success('All processed articles already have embeddings.');
      } else if (data.errors > 0) {
        toast.warning(
          `Embedded ${data.embedded} article${data.embedded === 1 ? '' : 's'}; ${data.errors} error${
            data.errors === 1 ? '' : 's'
          }.`,
        );
      } else {
        toast.success(
          `Embedded ${data.embedded} article${data.embedded === 1 ? '' : 's'}. ` +
            `Toggle "Articles" on the graph to see similarity edges.`,
        );
      }
      setConfirming(false);
    },
    onError: () => {
      setConfirming(false);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Semantic similarity
        </CardTitle>
        <CardDescription>
          Generate embeddings for processed articles so the graph can surface "similar to" edges
          between articles covering the same story across different feeds. Backed by pgvector with
          cosine similarity ≥ 0.82.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!confirming && (
          <Button variant="outline" disabled={embed.isPending} onClick={() => setConfirming(true)}>
            Generate embeddings
          </Button>
        )}

        {confirming && (
          <div className="space-y-3">
            <p className="text-sm">
              This embeds up to 200 processed articles per call against the active LLM provider (
              <span className="font-mono text-xs">text-embedding-3-small</span> for OpenAI;
              deterministic fallback for the mock provider). Idempotent — articles that already have
              an embedding are skipped, so it's safe to re-click.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={embed.isPending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button disabled={embed.isPending} onClick={() => embed.mutate()}>
                {embed.isPending ? 'Embedding…' : 'Yes, generate'}
              </Button>
            </div>
          </div>
        )}

        {embed.error && <p className="mt-3 text-sm text-destructive">{embed.error.message}</p>}
      </CardContent>
    </Card>
  );
}

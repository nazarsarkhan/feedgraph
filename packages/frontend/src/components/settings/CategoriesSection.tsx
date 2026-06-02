import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCategories } from '@/hooks/useCategories';
import { ApiException } from '@/lib/api';
import { categoriesApi, type Category } from '@/lib/categories';

export function CategoriesSection() {
  const queryClient = useQueryClient();
  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['categories'] });
  const { data: categories, isPending, error } = useCategories();
  const [name, setName] = useState('');

  const create = useMutation<Category, ApiException, { name: string }>({
    mutationFn: categoriesApi.create,
    onSuccess: async () => {
      await invalidate();
      toast.success('Category added');
      setName('');
    },
  });

  // Inline rename — clicking a category name swaps it for an input.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const rename = useMutation<Category, ApiException, { id: string; name: string }>({
    mutationFn: ({ id, name: n }) => categoriesApi.rename(id, { name: n }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Category renamed');
      setEditingId(null);
    },
  });

  // Tracks the specific category being deleted so only that chip's X
  // shows the pending state, not all of them.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const remove = useMutation<void, ApiException, string>({
    mutationFn: categoriesApi.remove,
    onMutate: (id) => {
      setPendingDeleteId(id);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success('Category deleted');
    },
    onSettled: () => {
      setPendingDeleteId(null);
    },
  });

  const onRenameSubmit = (e: FormEvent<HTMLFormElement>, id: string): void => {
    e.preventDefault();
    const trimmed = editingText.trim();
    if (!trimmed) return;
    rename.mutate({ id, name: trimmed });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>
          Tag articles with custom categories during LLM processing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending && <SkeletonChips />}

        {error && (
          <p className="text-sm text-destructive">Could not load categories: {error.message}</p>
        )}

        {categories && categories.length === 0 && (
          <p className="text-sm text-muted-foreground">No categories yet. Add one below.</p>
        )}

        {categories && categories.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const isDeleting = pendingDeleteId === c.id;
              if (editingId === c.id) {
                return (
                  <li key={c.id}>
                    <form
                      onSubmit={(e) => onRenameSubmit(e, c.id)}
                      className="flex items-center gap-1"
                    >
                      <Input
                        autoFocus
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="h-7 w-[160px]"
                        disabled={rename.isPending}
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="h-7 w-7"
                        disabled={rename.isPending}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </form>
                  </li>
                );
              }
              return (
                <li key={c.id}>
                  <Badge variant="secondary" className="gap-1 pr-1 font-normal">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditingText(c.name);
                      }}
                      className="rounded-sm hover:underline focus:outline-none focus:ring-1 focus:ring-ring"
                      aria-label={`Rename ${c.name}`}
                    >
                      {c.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${c.name}`}
                      disabled={isDeleting}
                      onClick={() => remove.mutate(c.id)}
                      className="ml-0.5 rounded-sm p-0.5 hover:bg-background/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category name"
            className="max-w-[280px]"
            disabled={create.isPending}
          />
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            Add
          </Button>
        </form>

        {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
        {rename.error && <p className="text-sm text-destructive">{rename.error.message}</p>}
      </CardContent>
    </Card>
  );
}

function SkeletonChips() {
  return (
    <div className="flex gap-1.5">
      <div className="h-6 w-24 animate-pulse rounded-md bg-muted" />
      <div className="h-6 w-20 animate-pulse rounded-md bg-muted" />
      <div className="h-6 w-28 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

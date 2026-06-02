import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiException } from '@/lib/api';
import { axesApi, type Axis, type AxisValue } from '@/lib/axes';
import { cn } from '@/lib/utils';

interface Props {
  axis: Axis;
}

export function AxisCard({ axis }: Props) {
  const queryClient = useQueryClient();
  const invalidate = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['axes'] });

  const [value, setValue] = useState('');
  const [renamingAxis, setRenamingAxis] = useState(false);
  const [axisName, setAxisName] = useState(axis.name);
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const addValue = useMutation<AxisValue, ApiException, { value: string }>({
    mutationFn: (body) => axesApi.addValue(axis.id, body),
    onSuccess: async () => {
      await invalidate();
      toast.success('Value added');
      setValue('');
    },
  });

  const renameAxis = useMutation<Axis, ApiException, string>({
    mutationFn: (name) => axesApi.rename(axis.id, { name }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Axis renamed');
      setRenamingAxis(false);
    },
  });

  const deleteAxis = useMutation<void, ApiException, void>({
    mutationFn: () => axesApi.remove(axis.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Axis deleted');
    },
  });

  const renameValue = useMutation<AxisValue, ApiException, { valueId: string; value: string }>({
    mutationFn: ({ valueId, value: v }) => axesApi.renameValue(axis.id, valueId, { value: v }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Value renamed');
      setEditingValueId(null);
    },
  });

  // Per-value pending tracking: only the chip being deleted shows the pending
  // state, the rest stay interactive.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const removeValue = useMutation<void, ApiException, string>({
    mutationFn: (valueId) => axesApi.removeValue(axis.id, valueId),
    onMutate: (valueId) => setPendingDeleteId(valueId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Value deleted');
    },
    onSettled: () => setPendingDeleteId(null),
  });

  const onAddSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    addValue.mutate({ value: trimmed });
  };

  const onRenameAxisSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = axisName.trim();
    if (!trimmed || trimmed === axis.name) {
      setRenamingAxis(false);
      return;
    }
    renameAxis.mutate(trimmed);
  };

  const startEditValue = (v: AxisValue): void => {
    setEditingValueId(v.id);
    setEditingText(v.value);
  };

  const onRenameValueSubmit = (e: FormEvent<HTMLFormElement>, valueId: string): void => {
    e.preventDefault();
    const trimmed = editingText.trim();
    if (!trimmed) return;
    renameValue.mutate({ valueId, value: trimmed });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          {renamingAxis ? (
            <form onSubmit={onRenameAxisSubmit} className="flex flex-1 items-center gap-2">
              <Input
                autoFocus
                value={axisName}
                onChange={(e) => setAxisName(e.target.value)}
                className="h-8"
                disabled={renameAxis.isPending}
              />
              <Button type="submit" size="icon" className="h-8 w-8" disabled={renameAxis.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  setAxisName(axis.name);
                  setRenamingAxis(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <>
              <div className="min-w-0">
                <CardTitle className="text-base">{axis.name}</CardTitle>
                {axis.description && <CardDescription>{axis.description}</CardDescription>}
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={`Rename ${axis.name}`}
                  onClick={() => {
                    setAxisName(axis.name);
                    setRenamingAxis(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${axis.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete axis &ldquo;{axis.name}&rdquo;?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the axis and all its values. Existing article classifications
                        on this axis are dropped. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleteAxis.isPending}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={deleteAxis.isPending}
                        onClick={(e) => {
                          e.preventDefault();
                          deleteAxis.mutate();
                        }}
                        className={cn(buttonVariants({ variant: 'destructive' }))}
                      >
                        {deleteAxis.isPending ? 'Deleting…' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          )}
        </div>
        {renameAxis.error && <p className="text-sm text-destructive">{renameAxis.error.message}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {axis.values.length === 0 ? (
          <p className="text-sm text-muted-foreground">No values yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {axis.values.map((v) => {
              const isDeleting = pendingDeleteId === v.id;
              if (editingValueId === v.id) {
                return (
                  <li key={v.id}>
                    <form
                      onSubmit={(e) => onRenameValueSubmit(e, v.id)}
                      className="flex items-center gap-1"
                    >
                      <Input
                        autoFocus
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="h-7 w-[140px]"
                        disabled={renameValue.isPending}
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="h-7 w-7"
                        disabled={renameValue.isPending}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditingValueId(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </form>
                  </li>
                );
              }
              return (
                <li key={v.id}>
                  <Badge variant="outline" className="gap-1 pr-1 font-normal">
                    <button
                      type="button"
                      onClick={() => startEditValue(v)}
                      className="rounded-sm hover:underline focus:outline-none focus:ring-1 focus:ring-ring"
                      aria-label={`Rename ${v.value}`}
                    >
                      {v.value}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${v.value}`}
                      disabled={isDeleting}
                      onClick={() => removeValue.mutate(v.id)}
                      className="ml-0.5 rounded-sm p-0.5 hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={onAddSubmit} className="flex flex-wrap gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="New value"
            className="max-w-[200px]"
            disabled={addValue.isPending}
          />
          <Button type="submit" size="sm" disabled={addValue.isPending || !value.trim()}>
            Add value
          </Button>
        </form>

        {addValue.error && <p className="text-sm text-destructive">{addValue.error.message}</p>}
        {renameValue.error && (
          <p className="text-sm text-destructive">{renameValue.error.message}</p>
        )}
        {deleteAxis.error && <p className="text-sm text-destructive">{deleteAxis.error.message}</p>}
      </CardContent>
    </Card>
  );
}

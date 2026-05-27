import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiException } from '@/lib/api';
import { axesApi, type Axis, type AxisValue } from '@/lib/axes';

interface Props {
  axis: Axis;
}

export function AxisCard({ axis }: Props) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');

  const addValue = useMutation<AxisValue, ApiException, { value: string }>({
    mutationFn: (body) => axesApi.addValue(axis.id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['axes'] });
      toast.success('Value added');
      setValue('');
    },
  });

  // Per-value pending tracking: only the X for the chip currently being
  // deleted is disabled, the others remain interactive. A single boolean
  // would freeze every chip during any one delete, which feels broken
  // when the user is editing several values in succession.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const removeValue = useMutation<void, ApiException, string>({
    mutationFn: (valueId) => axesApi.removeValue(axis.id, valueId),
    onMutate: (valueId) => {
      setPendingDeleteId(valueId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['axes'] });
      toast.success('Value deleted');
    },
    onSettled: () => {
      setPendingDeleteId(null);
    },
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    addValue.mutate({ value: trimmed });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{axis.name}</CardTitle>
        {axis.description && <CardDescription>{axis.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {axis.values.length === 0 ? (
          <p className="text-sm text-muted-foreground">No values yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {axis.values.map((v) => {
              const isDeleting = pendingDeleteId === v.id;
              return (
                <li key={v.id}>
                  <Badge variant="outline" className="gap-1 pr-1 font-normal">
                    {v.value}
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

        <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
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
      </CardContent>
    </Card>
  );
}

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiException } from '@/lib/api';
import { axesApi, type Axis } from '@/lib/axes';

// Mirrors the backend CreateAxisDto: name 1–100 chars, 1–50 values, each
// 1–100 chars. The array-of-objects shape is what react-hook-form's
// useFieldArray wants; we flatten to string[] on submit.
const createAxisSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Max 100 characters'),
  values: z
    .array(
      z.object({
        value: z.string().trim().min(1, 'Value cannot be empty').max(100, 'Max 100 characters'),
      }),
    )
    .min(1, 'Add at least one value')
    .max(50, 'At most 50 values'),
});

type CreateAxisForm = z.infer<typeof createAxisSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAxisDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  const {
    register: field,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAxisForm>({
    resolver: zodResolver(createAxisSchema),
    defaultValues: { name: '', values: [{ value: '' }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'values' });

  const create = useMutation<Axis, ApiException, CreateAxisForm>({
    mutationFn: (form) =>
      axesApi.create({ name: form.name, values: form.values.map((v) => v.value) }),
    onSuccess: async (axis) => {
      await queryClient.invalidateQueries({ queryKey: ['axes'] });
      toast.success(`Axis "${axis.name}" created`);
      onOpenChange(false);
    },
  });

  // Clear the form (and any error) on close — same lifecycle as AddFeedDialog.
  useEffect(() => {
    if (!open) {
      reset({ name: '', values: [{ value: '' }] });
      create.reset();
    }
    // create.reset and reset are stable per their library contracts; keying
    // the effect on `open` alone is intentional.
  }, [open, reset]);

  const onSubmit = handleSubmit((form) => create.mutate(form));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New axis</DialogTitle>
          <DialogDescription>
            An axis is a classification dimension. Give it a name and the values the LLM may assign.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="axis-name">Name</Label>
            <Input id="axis-name" placeholder="e.g. Sentiment" {...field('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Values</Label>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={f.id} className="space-y-1">
                  <div className="flex gap-2">
                    <Input placeholder={`Value ${i + 1}`} {...field(`values.${i}.value`)} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove value ${i + 1}`}
                      disabled={fields.length <= 1}
                      onClick={() => remove(i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {errors.values?.[i]?.value && (
                    <p className="text-sm text-destructive">{errors.values[i]?.value?.message}</p>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ value: '' })}>
              <Plus className="h-4 w-4" />
              Add value
            </Button>
            {/* Array-level error (e.g. min/max count) — distinct from the
                per-item errors above. */}
            {errors.values?.message && (
              <p className="text-sm text-destructive">{errors.values.message}</p>
            )}
          </div>

          {create.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {create.error.message}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create axis'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

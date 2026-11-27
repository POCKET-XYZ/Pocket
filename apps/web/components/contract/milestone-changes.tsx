'use client';

import type { ContractDetail, MilestoneChange } from '@pocket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { date, todayIso } from '@/lib/format';

/** Milestones whose details can still change: not delivered, paid or disputed. */
const EDITABLE = ['pending', 'changes_requested'];

interface DetailsDraft {
  position: number;
  dueDate: string;
  description: string;
  acceptanceCriteria: string;
}

/**
 * The startup changes dates, descriptions or criteria of the milestones not
 * delivered yet, once the deposit is in. None of it is in the escrow, so the
 * escrow stays as it is. A date only moves later: a change never leaves the
 * specialist late. The specialist sees what changed when they open the
 * contract.
 */
export function EditDetailsDialog({ contract }: { contract: ContractDetail }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const editable = contract.milestones.filter((m) => EDITABLE.includes(m.status));
  const start = (): DetailsDraft[] =>
    editable.map((milestone) => ({
      position: milestone.position,
      dueDate: milestone.dueDate.slice(0, 10),
      description: milestone.description,
      acceptanceCriteria: milestone.acceptanceCriteria ?? '',
    }));
  const [drafts, setDrafts] = useState<DetailsDraft[]>(start);

  const save = useMutation({
    mutationFn: () =>
      api(`/contracts/${contract.id}/details`, {
        method: 'PUT',
        body: {
          milestones: drafts.map((draft) => ({
            position: draft.position,
            dueDate: draft.dueDate,
            description: draft.description.trim(),
            ...(draft.acceptanceCriteria.trim()
              ? { acceptanceCriteria: draft.acceptanceCriteria.trim() }
              : {}),
          })),
        },
      }),
    onSuccess: async () => {
      toast.success('Cambios guardados. El experto los ve al abrir el contrato.');
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['contracts', contract.id] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (editable.length === 0) return null;

  function update(position: number, patch: Partial<DetailsDraft>) {
    setDrafts(drafts.map((d) => (d.position === position ? { ...d, ...patch } : d)));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDrafts(start());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PencilIcon /> Editar fechas y detalles
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar fechas y detalles</DialogTitle>
          <DialogDescription>
            El pago ya está depositado, así que los montos y los nombres de los hitos
            quedan como están. Puedes mover una fecha para más tarde y cambiar qué se
            entrega o qué debe cumplir. El experto lo ve al abrir el contrato.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {drafts.map((draft) => {
            const milestone = editable.find((m) => m.position === draft.position)!;
            const earliest = milestone.dueDate.slice(0, 10);
            const today = todayIso();
            return (
              <div
                key={draft.position}
                className="space-y-3 rounded-xl border border-border p-4"
              >
                <p className="text-sm font-semibold text-navy wrap-anywhere">
                  Hito {draft.position + 1}: {milestone.title}
                </p>
                <label className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">Fecha de entrega</span>
                  <Input
                    type="date"
                    aria-label={`Fecha de entrega del hito ${draft.position + 1}`}
                    required
                    min={earliest > today ? earliest : today}
                    value={draft.dueDate}
                    onChange={(event) =>
                      update(draft.position, { dueDate: event.target.value })
                    }
                  />
                </label>
                <Textarea
                  aria-label={`Qué se entrega en el hito ${draft.position + 1}`}
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={2}
                  value={draft.description}
                  onChange={(event) =>
                    update(draft.position, { description: event.target.value })
                  }
                />
                <Textarea
                  placeholder="Qué debe cumplir para aprobarse"
                  aria-label={`Qué debe cumplir el hito ${draft.position + 1}`}
                  minLength={10}
                  maxLength={2000}
                  rows={2}
                  value={draft.acceptanceCriteria}
                  onChange={(event) =>
                    update(draft.position, { acceptanceCriteria: event.target.value })
                  }
                />
              </div>
            );
          })}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FIELD_LABELS: Record<MilestoneChange['field'], string> = {
  dueDate: 'Fecha de entrega',
  description: 'Qué se entrega',
  acceptanceCriteria: 'Qué debe cumplir para aprobarse',
};

function describeChange(change: MilestoneChange): string {
  if (change.field === 'dueDate') {
    return `${date(change.before)} → ${date(change.after)}`;
  }
  return change.after ? `"${change.after}"` : 'se quitó';
}

/**
 * What the startup changed since the specialist last opened the contract,
 * shown once in a small window. Nothing to accept: the escrow did not change.
 */
export function ChangesNotice({ contract }: { contract: ContractDetail }) {
  const queryClient = useQueryClient();
  const changes = contract.pendingChanges ?? [];
  const [dismissed, setDismissed] = useState(false);
  const seen = useMutation({
    mutationFn: () => api(`/contracts/${contract.id}/details/seen`, { method: 'POST' }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contracts', contract.id] });
    },
  });
  if (changes.length === 0) return null;

  function close() {
    setDismissed(true);
    seen.mutate();
  }

  return (
    <Dialog open={!dismissed} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>La empresa cambió detalles del contrato</DialogTitle>
          <DialogDescription>
            Los montos y el pago protegido siguen igual. Esto es lo que cambió:
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          {changes.map((change) => (
            <li
              key={`${change.position}-${change.field}`}
              className="rounded-lg border border-border px-3 py-2"
            >
              <p className="font-medium text-navy wrap-anywhere">
                Hito {change.position + 1}: {change.title}
              </p>
              <p className="whitespace-pre-line text-muted-foreground wrap-anywhere">
                {FIELD_LABELS[change.field]}: {describeChange(change)}
              </p>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={close}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

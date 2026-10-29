'use client';

import {
  POCKET_FEE_PERCENT,
  TRUSTLESS_WORK_FEE_PERCENT,
  totalAfterFees,
  type Applicant,
  type JobListing,
} from '@pocket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { todayIso, usdc } from '@/lib/format';
import { fromUnits, toUnits } from '@/lib/usdc';
import { cn } from '@/lib/utils';

interface MilestoneDraft {
  title: string;
  description: string;
  acceptanceCriteria: string;
  amount: string;
  dueDate: string;
}

const MAX_MILESTONES = 5;

/**
 * The plan the startup already posted with the job, ready to send. When the
 * specialist offered a different price, every amount moves with it and the last
 * one absorbs the rounding, so the milestones still add up exactly.
 */
function planFrom(job: JobListing | undefined, price: string): MilestoneDraft[] {
  if (!job || job.milestones.length === 0) {
    return [
      { title: '', description: '', acceptanceCriteria: '', amount: price, dueDate: '' },
    ];
  }
  const budget = toUnits(job.budget);
  const agreed = toUnits(price);
  let assigned = BigInt(0);
  return job.milestones.map((milestone, index) => {
    const share =
      index === job.milestones.length - 1
        ? agreed - assigned
        : budget === BigInt(0)
          ? BigInt(0)
          : (toUnits(milestone.amount) * agreed) / budget;
    assigned += share;
    return {
      title: milestone.title,
      description: milestone.description,
      acceptanceCriteria: milestone.acceptanceCriteria,
      amount: fromUnits(share),
      dueDate: milestone.dueDate.slice(0, 10),
    };
  });
}

/**
 * The startup hires an applicant. The milestones come from the job, so the
 * terms are the ones both sides already read; they can still be adjusted if
 * the two of them negotiated something else.
 */
export function HireDialog({
  applicant,
  job,
}: {
  applicant: Applicant;
  job?: JobListing;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(() =>
    planFrom(job, applicant.price),
  );

  const total = milestones.reduce(
    (sum, milestone) => sum + toUnits(milestone.amount),
    BigInt(0),
  );
  const remaining = toUnits(applicant.price) - total;

  const queryClient = useQueryClient();
  const hire = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/contracts', {
        method: 'POST',
        body: {
          applicationId: applicant.id,
          milestones: milestones.map((milestone) => ({
            title: milestone.title.trim(),
            description: milestone.description.trim(),
            ...(milestone.acceptanceCriteria.trim()
              ? { acceptanceCriteria: milestone.acceptanceCriteria.trim() }
              : {}),
            amount: Number(milestone.amount),
            dueDate: milestone.dueDate,
          })),
        },
      }),
    onSuccess: async (contract) => {
      toast.success('Condiciones enviadas. El experto tiene que aceptarlas.');
      // The job is no longer open and the application is taken.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['contracts', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
      ]);
      router.push(`/contracts/${contract.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function update(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((current) =>
      current.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (remaining !== BigInt(0)) {
      toast.error(`Los hitos deben sumar ${usdc(applicant.price)}`);
      return;
    }
    hire.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Contratar</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Contratar a {applicant.specialist?.displayName ?? 'este experto'}
          </DialogTitle>
          <DialogDescription>
            Divide los {usdc(applicant.price)} acordados en hitos. Cada uno se paga
            cuando apruebas su entrega.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {milestones.map((milestone, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-navy">Hito {index + 1}</p>
                {milestones.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Quitar hito"
                    onClick={() =>
                      setMilestones((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </div>
              <Input
                placeholder="Título"
                required
                minLength={3}
                maxLength={120}
                value={milestone.title}
                onChange={(event) => update(index, { title: event.target.value })}
              />
              <Textarea
                placeholder="Qué se tiene que entregar"
                required
                minLength={10}
                maxLength={2000}
                rows={2}
                value={milestone.description}
                onChange={(event) => update(index, { description: event.target.value })}
              />
              <Textarea
                placeholder="Qué debe cumplir para aprobarse"
                maxLength={2000}
                rows={2}
                value={milestone.acceptanceCriteria}
                onChange={(event) =>
                  update(index, { acceptanceCriteria: event.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  placeholder="Monto (USDC)"
                  required
                  min={1}
                  step="any"
                  value={milestone.amount}
                  onChange={(event) => update(index, { amount: event.target.value })}
                />
                <Input
                  type="date"
                  required
                  min={todayIso()}
                  value={milestone.dueDate}
                  onChange={(event) => update(index, { dueDate: event.target.value })}
                />
              </div>
            </div>
          ))}

          {milestones.length < MAX_MILESTONES ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setMilestones((current) => [
                  ...current,
                  {
                    title: '',
                    description: '',
                    acceptanceCriteria: '',
                    amount: remaining > BigInt(0) ? fromUnits(remaining) : '',
                    dueDate: '',
                  },
                ])
              }
            >
              <PlusIcon /> Agregar hito
            </Button>
          ) : null}

          <p
            className={cn(
              'text-sm',
              remaining === BigInt(0) ? 'text-emerald-700' : 'text-destructive',
            )}
          >
            {remaining === BigInt(0)
              ? 'Los hitos suman el precio acordado.'
              : remaining > BigInt(0)
                ? `Faltan ${usdc(fromUnits(remaining))} por asignar.`
                : `${usdc(fromUnits(-remaining))} por encima del precio acordado.`}
          </p>

          {remaining === BigInt(0) ? (
            <p className="rounded-lg bg-celeste-light/40 px-3 py-2 text-sm text-muted-foreground">
              Tú depositas el total de {usdc(applicant.price)}. Trustless Work, que opera el
              contrato, se queda con el {TRUSTLESS_WORK_FEE_PERCENT}% de cada pago y Pocket
              con el {POCKET_FEE_PERCENT}%, así que{' '}
              {applicant.specialist?.displayName ?? 'el experto'} recibe{' '}
              {usdc(
                totalAfterFees(
                  milestones.map((milestone) => fromUnits(toUnits(milestone.amount))),
                ),
              )}{' '}
              en total.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={hire.isPending || remaining !== BigInt(0)}>
              {hire.isPending ? 'Enviando...' : 'Enviar condiciones'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

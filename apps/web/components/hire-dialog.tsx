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
import { useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useKycEnabled } from '@/components/activation';
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
 * The milestones at a new price: each keeps its share and the last one
 * absorbs the rounding. The shares are the job's own amounts, or the ones the
 * startup typed, never amounts already rounded to another price, so going
 * from 175 to 140 and back to 105 lands on the job's 55 and 50 again. With no
 * shares, the price is split evenly.
 */
function spread(
  milestones: MilestoneDraft[],
  shares: bigint[],
  price: string,
): MilestoneDraft[] {
  const target = toUnits(price);
  const weights =
    shares.length === milestones.length
      ? shares
      : milestones.map((milestone) => toUnits(milestone.amount));
  const current = weights.reduce((sum, weight) => sum + weight, BigInt(0));
  const count = BigInt(milestones.length);
  let assigned = BigInt(0);
  return milestones.map((milestone, index) => {
    const share =
      index === milestones.length - 1
        ? target - assigned
        : current === BigInt(0)
          ? target / count
          : (weights[index] * target) / current;
    assigned += share;
    return { ...milestone, amount: fromUnits(share) };
  });
}

const amountsOf = (milestones: MilestoneDraft[]) =>
  milestones.map((milestone) => toUnits(milestone.amount));

/**
 * The startup hires an applicant. The milestones come from the job, so the
 * terms are the ones both sides already read; they can still be adjusted if
 * the two of them negotiated something else. The price starts as the one the
 * applicant asked for; the startup can offer its own instead, and the
 * applicant accepts or declines it like any terms.
 */
export function HireDialog({
  applicant,
  job,
}: {
  applicant: Applicant;
  job?: JobListing;
}) {
  const router = useRouter();
  const kyc = useKycEnabled();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(applicant.price);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(() =>
    planFrom(job, applicant.price),
  );
  // Each milestone's part of the price, as the job set it or the startup typed it.
  const [shares, setShares] = useState<bigint[]>(() =>
    job && job.milestones.length > 0
      ? job.milestones.map((milestone) => toUnits(milestone.amount))
      : [],
  );

  const name = applicant.specialist?.displayName ?? 'el experto';
  const priceUnits = toUnits(price);
  const counteroffer = priceUnits !== toUnits(applicant.price);
  const budget = job ? fromUnits(toUnits(String(job.budget))) : null;
  const total = milestones.reduce(
    (sum, milestone) => sum + toUnits(milestone.amount),
    BigInt(0),
  );
  const remaining = priceUnits - total;

  // Milestones that do not add up to the price stop the form at the last
  // amount, so the tap on the button says what is missing right there
  // (InvalidFieldHelp) instead of a button that does nothing.
  const amountFields = useRef<(HTMLInputElement | null)[]>([]);
  useLayoutEffect(() => {
    const fields = amountFields.current.slice(0, milestones.length);
    const last = fields[fields.length - 1];
    const message =
      remaining === BigInt(0) || priceUnits < toUnits('1')
        ? ''
        : remaining > BigInt(0)
          ? `Faltan ${usdc(fromUnits(remaining))} por asignar: los hitos tienen que sumar ${usdc(fromUnits(priceUnits))}.`
          : `Los hitos pasan por ${usdc(fromUnits(-remaining))} el precio que ofreces (${usdc(fromUnits(priceUnits))}).`;
    for (const field of fields) field?.setCustomValidity(field === last ? message : '');
  }, [remaining, priceUnits, milestones.length]);

  function changePrice(next: string) {
    setPrice(next);
    // The milestones follow a price that can be paid; a half-typed one waits.
    if (toUnits(next) >= toUnits('1')) setMilestones(spread(milestones, shares, next));
  }

  /** A milestone added, removed or with an amount typed: its shares are the new ones. */
  function reshape(next: MilestoneDraft[]) {
    setMilestones(next);
    setShares(amountsOf(next));
  }

  const queryClient = useQueryClient();
  const hire = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/contracts', {
        method: 'POST',
        body: {
          applicationId: applicant.id,
          // Sent only as a counteroffer: otherwise the applicant's own price.
          ...(counteroffer ? { price: Number(fromUnits(priceUnits)) } : {}),
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
      toast.success(
        counteroffer
          ? 'Contraoferta enviada. El experto tiene que aceptarla.'
          : 'Condiciones enviadas. El experto tiene que aceptarlas.',
      );
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
    const next = milestones.map((m, i) => (i === index ? { ...m, ...patch } : m));
    if (patch.amount === undefined) setMilestones(next);
    else reshape(next);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The fields already stop the form on these (min price, amounts that add up).
    if (priceUnits < toUnits('1') || remaining !== BigInt(0)) return;
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
            Elige el precio y divídelo en hitos. Cada hito se paga cuando apruebas su
            entrega.
            {kyc && !applicant.identityVerified
              ? ' Antes de aceptar, el experto verifica su identidad con Pocket.'
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2 rounded-xl border border-border p-4">
            <label htmlFor="hire-price" className="text-sm font-semibold text-navy">
              Precio que ofreces (USDC)
            </label>
            <Input
              id="hire-price"
              type="number"
              inputMode="decimal"
              required
              min={1}
              step="any"
              value={price}
              onChange={(event) => changePrice(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {name} pidió {usdc(applicant.price)}
              {budget !== null ? ` y tu presupuesto era de ${usdc(budget)}` : ''}.{' '}
              {counteroffer
                ? `Le llega como contraoferta: ${name} la acepta o la rechaza.`
                : 'Puedes ofrecerle otro precio: le llega como contraoferta.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {budget !== null && toUnits(budget) !== priceUnits ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changePrice(budget)}
                >
                  Ofrecer mi presupuesto ({usdc(budget)})
                </Button>
              ) : null}
              {counteroffer ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changePrice(applicant.price)}
                >
                  Volver a su precio ({usdc(applicant.price)})
                </Button>
              ) : null}
            </div>
          </div>

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
                    onClick={() => reshape(milestones.filter((_, i) => i !== index))}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </div>
              <Input
                placeholder="Título"
                aria-label={`Título del hito ${index + 1}`}
                required
                minLength={3}
                maxLength={120}
                value={milestone.title}
                onChange={(event) => update(index, { title: event.target.value })}
              />
              <Textarea
                placeholder="Qué se tiene que entregar"
                aria-label={`Qué se entrega en el hito ${index + 1}`}
                required
                minLength={10}
                maxLength={2000}
                rows={2}
                value={milestone.description}
                onChange={(event) => update(index, { description: event.target.value })}
              />
              <Textarea
                placeholder="Qué debe cumplir para aprobarse"
                aria-label={`Qué debe cumplir el hito ${index + 1}`}
                minLength={10}
                maxLength={2000}
                rows={2}
                value={milestone.acceptanceCriteria}
                onChange={(event) =>
                  update(index, { acceptanceCriteria: event.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  ref={(field) => {
                    amountFields.current[index] = field;
                  }}
                  type="number"
                  placeholder="Monto (USDC)"
                  aria-label={`Monto del hito ${index + 1}`}
                  required
                  min={1}
                  step="any"
                  value={milestone.amount}
                  onChange={(event) => update(index, { amount: event.target.value })}
                />
                <Input
                  type="date"
                  aria-label={`Fecha de entrega del hito ${index + 1}`}
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
                reshape([
                  ...milestones,
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
              ? 'Los hitos suman el precio que ofreces.'
              : remaining > BigInt(0)
                ? `Faltan ${usdc(fromUnits(remaining))} por asignar.`
                : `${usdc(fromUnits(-remaining))} por encima del precio que ofreces.`}
          </p>

          {remaining === BigInt(0) ? (
            <p className="rounded-lg bg-celeste-light/40 px-3 py-2 text-sm text-muted-foreground">
              Si {name} acepta, depositas el total de {usdc(fromUnits(priceUnits))}.
              Trustless Work, que opera el contrato, se queda con el{' '}
              {TRUSTLESS_WORK_FEE_PERCENT}% de cada pago y Pocket con el{' '}
              {POCKET_FEE_PERCENT}%, así que {name} recibe{' '}
              {usdc(
                totalAfterFees(
                  milestones.map((milestone) => fromUnits(toUnits(milestone.amount))),
                ),
              )}{' '}
              en total.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={hire.isPending}>
              {hire.isPending
                ? 'Enviando...'
                : counteroffer
                  ? 'Enviar contraoferta'
                  : 'Enviar condiciones'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import {
  DisputeOutcome,
  POCKET_FEE_PERCENT,
  TRUSTLESS_WORK_FEE_PERCENT,
  type DisputeDetail,
  type User,
} from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, compact, formValues } from '@/components/form';
import { Detail, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { KpiReport } from '@/components/contract/kpi-report';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { dateTime, usdc } from '@/lib/format';
import { fromUnits, toUnits } from '@/lib/usdc';
import { cn } from '@/lib/utils';
import { linkHost, safeHref } from '@/lib/links';

const OUTCOMES: { value: DisputeOutcome; label: string }[] = [
  { value: DisputeOutcome.PaySpecialist, label: 'Pagar al experto' },
  { value: DisputeOutcome.RefundStartup, label: 'Reembolsar a la startup' },
  { value: DisputeOutcome.Split, label: 'Repartir entre ambos' },
];

export default function DisputePage() {
  return <RequireAuth>{(user) => <DisputeView user={user} />}</RequireAuth>;
}

function DisputeView({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>();
  const dispute = useQuery({
    queryKey: ['disputes', id],
    queryFn: () => api<DisputeDetail>(`/disputes/${id}`),
  });

  if (dispute.isLoading) return <Loading />;
  if (dispute.error || !dispute.data)
    return <ErrorAlert error={dispute.error} title="No se encontró la disputa" />;
  const data = dispute.data;
  const { contract } = data.milestone;
  const who = (authorId: string) =>
    authorId === contract.startupId
      ? 'Startup'
      : authorId === contract.specialistId
        ? 'Experto'
        : 'Manager';

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <PageHeader
          title={`Disputa: ${data.milestone.title}`}
          description={
            <>
              Abierta por {data.openedById === contract.startupId ? 'la' : 'el'}{' '}
              {who(data.openedById).toLowerCase()} el {dateTime(data.createdAt)}.{' '}
              <Link href={`/contracts/${contract.id}`} className="underline">
                Ir al contrato
              </Link>
            </>
          }
          actions={<StatusBadge feminine status={data.status} className="px-3 py-1 text-sm" />}
        />

        <Card>
          <CardContent className="space-y-4 pt-6">
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Monto del hito">{usdc(data.milestone.amount)}</Detail>
              <Detail label="Estado del hito">
                <StatusBadge status={data.milestone.status} />
              </Detail>
            </dl>
            <Detail label="Motivo">
              <p className="whitespace-pre-line">{data.reason}</p>
            </Detail>
            {data.status === 'resolved' ? (
              <div className="rounded-xl bg-muted p-3 text-sm">
                <p className="font-medium text-navy">
                  Decisión: {usdc(data.specialistAmount)} para el experto,{' '}
                  {usdc(data.startupAmount)} para la startup.
                </p>
                {data.resolutionNote ? (
                  <p className="mt-1">{data.resolutionNote}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Resuelta el {dateTime(data.resolvedAt)}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {data.milestone.deliverables.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Entregas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.milestone.deliverables.map((deliverable) => (
                <div key={deliverable.id}>
                  <span className="font-medium text-navy">
                    Versión {deliverable.version}:{' '}
                  </span>
                  <a
                    href={safeHref(deliverable.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all underline"
                  >
                    {deliverable.url}
                  </a>{' '}
                  <span className="text-xs text-muted-foreground">
                    ({linkHost(deliverable.url)})
                  </span>
                  <KpiReport kpis={contract.job.kpis} deliverable={deliverable} />
                  {deliverable.feedback ? (
                    <p className="text-muted-foreground">
                      Cambios pedidos: {deliverable.feedback}
                    </p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Evidencia</CardTitle>
            <CardDescription>Enlaces y comentarios de ambas partes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay evidencia.</p>
            ) : null}
            {data.evidence.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {who(item.authorId)} · {dateTime(item.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line">{item.comment}</p>
                {item.url ? (
                  <a
                    href={safeHref(item.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 break-all underline"
                  >
                    {item.url} <ExternalLinkIcon className="size-3 shrink-0" />
                    <span className="text-xs text-muted-foreground no-underline">
                      ({linkHost(item.url)})
                    </span>
                  </a>
                ) : null}
              </div>
            ))}
            {data.status === 'open' ? <EvidenceForm disputeId={data.id} /> : null}
          </CardContent>
        </Card>
      </div>

      <aside>
        {user.role === 'manager' && data.status === 'open' ? (
          <ResolveCard dispute={data} />
        ) : null}
      </aside>
    </div>
  );
}

function EvidenceForm({ disputeId }: { disputeId: string }) {
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/disputes/${disputeId}/evidence`, { method: 'POST', body }),
    onSuccess: async () => {
      toast.success('Evidencia agregada');
      await queryClient.invalidateQueries({ queryKey: ['disputes', disputeId] });
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      // Most often the dispute was resolved meanwhile: show it as it is now.
      await queryClient.invalidateQueries({ queryKey: ['disputes', disputeId] });
    },
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    add.mutate(compact(formValues(form)), { onSuccess: () => form.reset() });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-border pt-4">
      <Textarea
        name="comment"
        required
        minLength={2}
        maxLength={2000}
        placeholder="Agrega un comentario"
      />
      <Input
        name="url"
        type="url"
        pattern="https://.+"
        title="Un enlace que empiece con https://"
        placeholder="Enlace (opcional)"
      />
      <Button type="submit" size="sm" disabled={add.isPending}>
        Agregar evidencia
      </Button>
    </form>
  );
}

function ResolveCard({ dispute }: { dispute: DisputeDetail }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [outcome, setOutcome] = useState<DisputeOutcome>(DisputeOutcome.PaySpecialist);
  const resolve = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/manager/disputes/${dispute.id}/resolve`, { method: 'POST', body }),
    onSuccess: async () => {
      toast.success('Disputa resuelta. El contrato pagó según la decisión.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['disputes'] }),
        queryClient.invalidateQueries({ queryKey: ['contracts'] }),
      ]);
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      await queryClient.invalidateQueries({ queryKey: ['disputes'] });
    },
  });

  const total = toUnits(dispute.milestone.amount);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    let summary = OUTCOMES.find((option) => option.value === outcome)?.label ?? '';
    if (outcome === DisputeOutcome.Split) {
      const raw = String(values.specialistAmount ?? '').trim();
      const toSpecialist = toUnits(raw);
      // The API takes more than 0, less than the whole, and 7 decimals at most.
      if (
        !/^\d+(\.\d{1,7})?$/.test(raw) ||
        toSpecialist <= BigInt(0) ||
        toSpecialist >= total
      ) {
        toast.error(
          `Asigna al experto más de 0 y menos de ${usdc(dispute.milestone.amount)}, con 7 decimales como máximo`,
        );
        return;
      }
      summary = `${fromUnits(toSpecialist)} USDC para el experto y ${fromUnits(total - toSpecialist)} USDC para la startup`;
    }
    const confirmed = await confirm({
      title: `¿${summary}?`,
      description: 'Esto se ejecuta en el contrato y no se puede deshacer.',
      confirmText: 'Resolver',
      irreversible: true,
    });
    if (!confirmed) return;
    resolve.mutate({
      outcome,
      note: values.note,
      ...(outcome === DisputeOutcome.Split
        ? { specialistAmount: Number(values.specialistAmount) }
        : {}),
    });
  }

  // A decision already recorded whose execution did not finish (the network
  // was slow): show it and let the manager send exactly it again. Any other
  // decision would be refused while this one may still land.
  if (dispute.outcome) {
    const label = OUTCOMES.find((option) => option.value === dispute.outcome)?.label;
    return (
      <Card className="border-yellow">
        <CardHeader>
          <CardTitle>Se está ejecutando una decisión</CardTitle>
          <CardDescription>
            {label}
            {dispute.outcome === DisputeOutcome.Split && dispute.specialistAmount
              ? `: ${usdc(dispute.specialistAmount)} para el experto, ${usdc(
                  fromUnits(total - toUnits(dispute.specialistAmount)),
                )} para la startup`
              : ''}
            . La red todavía no la había confirmado. Reintenta para terminarla; si ya se
            ejecutó, Pocket solo la registra.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={resolve.isPending}
            onClick={() =>
              resolve.mutate({
                outcome: dispute.outcome,
                note: dispute.resolutionNote ?? 'Resolución reintentada por un manager.',
                ...(dispute.outcome === DisputeOutcome.Split && dispute.specialistAmount
                  ? { specialistAmount: Number(dispute.specialistAmount) }
                  : {}),
              })
            }
          >
            {resolve.isPending ? 'Reintentando...' : 'Reintentar'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-navy">
      <CardHeader>
        <CardTitle>Decidir</CardTitle>
        <CardDescription>
          Pocket ejecuta la decisión en el contrato. Solo puede pagarles a las dos partes.
          Trustless Work se queda con el {TRUSTLESS_WORK_FEE_PERCENT}% y Pocket con el{' '}
          {POCKET_FEE_PERCENT}% de lo que se le paga a cada parte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-2">
            {OUTCOMES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setOutcome(option.value)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition',
                  outcome === option.value
                    ? 'border-navy bg-navy text-off-white'
                    : 'border-border hover:border-celeste',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {outcome === DisputeOutcome.Split ? (
            <Field
              label="USDC para el experto"
              htmlFor="specialistAmount"
              hint={`Más de 0 y menos de ${usdc(dispute.milestone.amount)}. La startup recibe el resto.`}
              required
            >
              <Input
                id="specialistAmount"
                name="specialistAmount"
                type="number"
                required
                min="0.0000001"
                step="0.0000001"
                inputMode="decimal"
              />
            </Field>
          ) : null}
          <Field label="Nota para ambas partes" htmlFor="note" required>
            <Textarea id="note" name="note" required minLength={10} maxLength={2000} />
          </Field>
          <Button type="submit" className="w-full" disabled={resolve.isPending}>
            {resolve.isPending ? 'Ejecutando en el contrato...' : 'Resolver disputa'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

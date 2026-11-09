'use client';

import type {
  AdminChainMilestone,
  AdminContractCheck,
  ChainOperationKind,
} from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  FileTextIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChainLink, short, shortDay } from '@/components/manager/admin-ui';
import { ErrorAlert, Loading } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import {
  date,
  dateTime,
  explorerAccount,
  explorerContract,
  explorerTx,
} from '@/lib/format';
import { cn } from '@/lib/utils';

export default function AdminContractPage() {
  return <RequireAuth roles={['manager']}>{() => <ContractControl />}</RequireAuth>;
}

const STEP_LABELS: Record<ChainOperationKind, string> = {
  trustline: 'Activar USDC',
  deploy: 'Crear el escrow',
  fund: 'Depósito',
  approve: 'Aprobación',
  release: 'Pago del hito',
  dispute: 'Disputa',
  resolve: 'Resolución de la disputa',
  payment: 'Envío de USDC',
};

const SIGNERS = { startup: 'Startup', specialist: 'Experto', pocket: 'Pocket' };

const STEP_STATUS = {
  confirmed: { label: 'Confirmado', className: 'bg-emerald-100 text-emerald-800' },
  prepared: { label: 'Sin firmar', className: 'bg-muted text-muted-foreground' },
  failed: { label: 'Falló', className: 'bg-red-100 text-red-800' },
};

function chainState(chain: AdminChainMilestone | null): string {
  if (!chain) return 'No está en la red';
  if (chain.resolved) return 'Resuelto';
  if (chain.released) return 'Pagado';
  if (chain.disputed) return 'En disputa';
  if (chain.approved) return 'Aprobado';
  return 'Sin mover';
}

function ContractControl() {
  const { id } = useParams<{ id: string }>();
  const check = useQuery({
    queryKey: ['manager', 'contracts', id, 'check'],
    queryFn: () => api<AdminContractCheck>(`/manager/contracts/${id}/check`),
  });

  return (
    <div className="space-y-8">
      <Link
        href="/manager/contracts"
        className="inline-flex items-center gap-1 text-sm text-navy underline-offset-2 hover:underline"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Todos los contratos
      </Link>
      {check.error ? (
        <ErrorAlert
          error={check.error}
          onRetry={() => check.refetch()}
          title="No se pudo leer el contrato en la red"
        />
      ) : !check.data ? (
        <Loading label="Leyendo el contrato en Stellar" />
      ) : (
        <Control
          data={check.data}
          refetch={() => void check.refetch()}
          busy={check.isFetching}
        />
      )}
    </div>
  );
}

function Control({
  data,
  refetch,
  busy,
}: {
  data: AdminContractCheck;
  refetch: () => void;
  busy: boolean;
}) {
  const ok = data.differences.length === 0;
  return (
    <>
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-bold text-navy">{data.jobTitle}</h1>
          <StatusBadge status={data.status} className="px-3 py-1 text-sm" />
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Party
            role="Startup"
            name={data.startup.name}
            href={`/startups/${data.startup.id}`}
            address={data.startup.address}
          />
          <Party
            role="Experto"
            name={data.specialist.name}
            href={`/specialists/${data.specialist.id}`}
            address={data.specialist.address}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/contracts/${data.contractId}`}>Ver como lo ven las partes</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/contracts/${data.contractId}/report`}>
              <FileTextIcon /> Reporte de resultados
            </Link>
          </Button>
          {data.escrow ? (
            <Button asChild size="sm" variant="outline">
              <a href={explorerContract(data.escrow.id)} target="_blank" rel="noreferrer">
                Escrow en stellar.expert <ExternalLinkIcon />
              </a>
            </Button>
          ) : null}
        </div>
      </header>

      <section
        className={cn(
          'space-y-3 rounded-2xl border p-5',
          ok
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-destructive/40 bg-red-50/60',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-bold text-navy">
            {ok ? (
              <CircleCheckIcon className="size-5 text-emerald-700" aria-hidden />
            ) : (
              <TriangleAlertIcon className="size-5 text-destructive" aria-hidden />
            )}
            {ok
              ? 'Todo coincide con Stellar'
              : data.differences.length === 1
                ? '1 diferencia con Stellar'
                : `${data.differences.length} diferencias con Stellar`}
          </h2>
          <Button size="sm" variant="outline" onClick={refetch} disabled={busy}>
            <RefreshCwIcon className={cn(busy && 'animate-spin')} />
            {busy ? 'Leyendo...' : 'Volver a comprobar'}
          </Button>
        </div>
        {ok ? (
          <p className="text-sm text-navy">
            {data.escrow
              ? 'El escrow existe, es de Pocket, recibió el depósito que dice el contrato, cada hito tiene el monto y el estado que tiene Pocket, y cada pago movió exactamente lo que guardaba su hito.'
              : 'Este contrato todavía no tiene escrow en la red: no hay dinero que comprobar.'}
          </p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-navy">
            {data.differences.map((difference) => (
              <li key={difference}>{difference}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Leído de la red el {dateTime(data.checkedAt)}. Un paso que se está confirmando
          puede aparecer como diferencia unos segundos.
        </p>
      </section>

      <Section title="Dinero">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <Money label="Total del contrato" value={data.money.amount} />
          <Money label="Depositado" value={data.money.deposited} />
          <Money label="Liberado" value={data.money.released} />
          <Money label="En el escrow, según Pocket" value={data.money.inEscrow} />
          <Money
            label="En el escrow, según Stellar"
            value={data.escrow ? data.escrow.balance : null}
            mismatch={data.escrow !== null && data.escrow.balance !== data.money.inEscrow}
          />
        </dl>
      </Section>

      <Section title="Hitos">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hito</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Entregado</TableHead>
              <TableHead>En Pocket</TableHead>
              <TableHead>En Stellar</TableHead>
              <TableHead className="text-right">Coincide</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.milestones.map((milestone) => (
              <TableRow key={milestone.position}>
                <TableCell className="whitespace-normal font-medium text-navy">
                  {milestone.position + 1}. {milestone.title}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {short(milestone.amount)}
                </TableCell>
                <TableCell>{date(milestone.dueDate)}</TableCell>
                <TableCell>{shortDay(milestone.firstDeliveredAt)}</TableCell>
                <TableCell>
                  <StatusBadge status={milestone.status} />
                </TableCell>
                <TableCell>{chainState(milestone.chain)}</TableCell>
                <TableCell className="text-right">
                  <Match ok={milestone.matches} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Pagos">
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no salió ningún pago del escrow.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Hito</TableHead>
                <TableHead className="text-right">Tenía el hito</TableHead>
                <TableHead className="text-right">Movió la transacción</TableHead>
                <TableHead className="text-right">Coincide</TableHead>
                <TableHead>Transacción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payments.map((payment) => (
                <TableRow key={payment.txHash}>
                  <TableCell>{shortDay(payment.confirmedAt)}</TableCell>
                  <TableCell>
                    {payment.milestonePosition + 1}
                    {payment.kind === 'resolve' ? ' · disputa' : ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {short(payment.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {payment.onChain === null
                      ? 'No se pudo leer'
                      : short(payment.onChain)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Match ok={payment.matches} />
                  </TableCell>
                  <TableCell>
                    <TxLink hash={payment.txHash} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">Montos en USDC.</p>
      </Section>

      <Section title="Cada paso en la red">
        {data.operations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ningún paso se envió a la red todavía.
          </p>
        ) : (
          <ol className="space-y-2">
            {data.operations.map((operation) => (
              <li
                key={operation.id}
                className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="font-medium text-navy">
                    {STEP_LABELS[operation.kind]}
                    {operation.milestonePosition !== null
                      ? ` · hito ${operation.milestonePosition + 1}`
                      : ''}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Firmó: {SIGNERS[operation.signer]} · {dateTime(operation.createdAt)}
                  </span>
                  {operation.error ? (
                    <span className="block text-xs text-destructive">
                      {operation.error}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      STEP_STATUS[operation.status].className,
                    )}
                  >
                    {STEP_STATUS[operation.status].label}
                  </span>
                  {operation.status === 'confirmed' ? (
                    <TxLink hash={operation.txHash} />
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function Party({
  role,
  name,
  href,
  address,
}: {
  role: string;
  name: string | null;
  href: string;
  address: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{role}</p>
      <Link
        href={href}
        className="font-medium text-navy underline-offset-2 hover:underline"
      >
        {name ?? 'Sin nombre'}
      </Link>
      <p className="mt-1">
        <ChainLink href={explorerAccount(address)} address={address} />
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-navy">{title}</h2>
      {children}
    </section>
  );
}

function Money({
  label,
  value,
  mismatch = false,
}: {
  label: string;
  value: string | null;
  mismatch?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-semibold tabular-nums',
          mismatch ? 'text-destructive' : 'text-navy',
        )}
      >
        {value === null ? '-' : `${short(value)} USDC`}
      </dd>
    </div>
  );
}

function Match({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
      <CircleCheckIcon className="size-4" aria-hidden /> Sí
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
      <TriangleAlertIcon className="size-4" aria-hidden /> No
    </span>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-navy underline"
    >
      Ver en stellar.expert <ExternalLinkIcon className="size-3" aria-hidden />
    </a>
  );
}

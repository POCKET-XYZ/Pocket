'use client';

import type { PeriodReport, User } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon, ExternalLinkIcon, PrinterIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorAlert, Loading } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, download, errorMessage } from '@/lib/api';
import { saveFile } from '@/lib/files';
import { date, dateTime, explorerTx, todayIso, usdc } from '@/lib/format';
import { deliveryWords } from '@/lib/home-figures';

export default function PeriodReportPage() {
  return (
    <RequireAuth roles={['startup', 'specialist']}>
      {(user) => <PeriodReportView user={user} />}
    </RequireAuth>
  );
}

interface Period {
  from: string;
  to: string;
}

/** The first day of a month `back` months before this one, in UTC. */
function monthStart(back: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    .toISOString()
    .slice(0, 10);
}

/** The last day of the month before this one, in UTC. */
function lastMonthEnd(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
    .toISOString()
    .slice(0, 10);
}

const PRESETS: { label: string; period: () => Period }[] = [
  { label: 'Este mes', period: () => ({ from: monthStart(0), to: todayIso() }) },
  { label: 'Mes pasado', period: () => ({ from: monthStart(1), to: lastMonthEnd() }) },
  { label: 'Últimos 3 meses', period: () => ({ from: monthStart(2), to: todayIso() }) },
  {
    label: 'Este año',
    period: () => ({ from: `${todayIso().slice(0, 4)}-01-01`, to: todayIso() }),
  },
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The period in the address, so a printed or shared report keeps its dates. */
function periodFromAddress(): Period {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  const to = params.get('to');
  return from && to && DAY.test(from) && DAY.test(to)
    ? { from, to }
    : (PRESETS[0] as (typeof PRESETS)[number]).period();
}

/** A YYYY-MM-DD day as people read it. */
function day(value: string): string {
  return date(`${value}T00:00:00Z`);
}

/** A timestamp as the reader's calendar day. */
function shortDay(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** An amount without the unit, for table cells under a USDC heading. */
function amount(value: string): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 7 });
}

function PeriodReportView({ user }: { user: User }) {
  // Rendered only in the browser, once the session is known.
  const [period, setPeriod] = useState<Period | null>(() =>
    typeof window === 'undefined' ? null : periodFromAddress(),
  );

  const report = useQuery({
    queryKey: ['reports', 'period', period?.from, period?.to],
    queryFn: () =>
      api<PeriodReport>(
        `/reports/period?from=${period?.from ?? ''}&to=${period?.to ?? ''}`,
      ),
    enabled: period !== null,
  });

  function choose(next: Period) {
    setPeriod(next);
    const url = new URL(window.location.href);
    url.searchParams.set('from', next.from);
    url.searchParams.set('to', next.to);
    window.history.replaceState(null, '', url);
  }

  return (
    <article className="mx-auto max-w-4xl space-y-8 print:max-w-none print:space-y-6">
      <div className="space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm underline">
            Volver al inicio
          </Link>
          {period ? (
            <div className="flex flex-wrap gap-2">
              <CsvButton period={period} />
              <Button size="sm" onClick={() => window.print()} disabled={!report.data}>
                <PrinterIcon /> Descargar PDF
              </Button>
            </div>
          ) : null}
        </div>
        {period ? (
          // A new period starts the date fields over from it.
          <PeriodPicker
            key={`${period.from}-${period.to}`}
            period={period}
            onChange={choose}
          />
        ) : null}
      </div>

      {report.error ? (
        <ErrorAlert error={report.error} title="No se pudo armar el reporte" />
      ) : !report.data ? (
        <Loading />
      ) : (
        <ReportBody data={report.data} user={user} />
      )}
    </article>
  );
}

function PeriodPicker({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  const [draft, setDraft] = useState(period);
  const valid = DAY.test(draft.from) && DAY.test(draft.to) && draft.from <= draft.to;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const value = preset.period();
          const active = value.from === period.from && value.to === period.to;
          return (
            <Button
              key={preset.label}
              size="sm"
              variant={active ? 'default' : 'outline'}
              onClick={() => onChange(value)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onChange(draft);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="from">Desde</Label>
          <Input
            id="from"
            type="date"
            value={draft.from}
            max={draft.to}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Hasta</Label>
          <Input
            id="to"
            type="date"
            value={draft.to}
            min={draft.from}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            className="w-40"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!valid || (draft.from === period.from && draft.to === period.to)}
        >
          Ver estas fechas
        </Button>
      </form>
    </div>
  );
}

function ReportBody({ data, user }: { data: PeriodReport; user: User }) {
  const startup = data.party.role === 'startup';
  const name = data.party.name ?? (startup ? 'Tu startup' : 'Tu perfil');
  const refunds = data.payments.some((p) => Number(p.breakdown?.startup ?? 0) > 0);
  const delivery = deliveryWords(data.delivery);

  return (
    <>
      <header className="space-y-2 border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Reporte del periodo · Pocket
        </p>
        <h1 className="text-3xl font-bold text-navy">{name}</h1>
        <p className="text-muted-foreground">
          Del {day(data.from)} al {day(data.to)} ·{' '}
          {data.contracts.length === 1
            ? '1 contrato con movimiento'
            : `${data.contracts.length} contratos con movimiento`}
        </p>
      </header>

      <Section title="Resumen">
        <ul className="grid gap-3 sm:grid-cols-2">
          <Fact>
            {data.kpis.withTarget === 0
              ? 'Sin resultados aprobados en estas fechas'
              : `${data.kpis.met} de ${data.kpis.withTarget} ${
                  data.kpis.withTarget === 1 ? 'meta cumplida' : 'metas cumplidas'
                }`}
          </Fact>
          <Fact>
            {data.milestones.delivered === 0
              ? 'Sin entregas en estas fechas'
              : `${data.milestones.onTime} de ${data.milestones.delivered} ${
                  data.milestones.delivered === 1 ? 'hito entregado' : 'hitos entregados'
                } a tiempo`}
          </Fact>
          <Fact>
            {delivery
              ? `Entrega promedio: ${delivery}`
              : 'Entrega promedio: sin entregas aún'}
          </Fact>
          <Fact>
            {data.payments.length === 1
              ? '1 pago comprobable en Stellar'
              : `${data.payments.length} pagos comprobables en Stellar`}
          </Fact>
        </ul>
      </Section>

      <Section title="Dinero">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Money
            label={startup ? 'Depositado en contratos' : 'Depositado por las startups'}
            value={data.money.deposited}
          />
          <Money label="Liberado de los contratos" value={data.money.released} />
          <Money
            label={startup ? 'Recibieron los expertos' : 'Recibiste'}
            value={data.money.toSpecialist}
          />
          <Money label="Comisión de Pocket" value={data.money.pocketFee} />
          <Money label="Comisión de Trustless Work" value={data.money.trustlessWorkFee} />
          {Number(data.money.toStartup) > 0 ? (
            <Money label="Devuelto a la startup" value={data.money.toStartup} />
          ) : null}
        </dl>
        {!data.money.verified ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Algún pago todavía no se pudo leer de Stellar. Vuelve a abrir el reporte en
            unos minutos.
          </p>
        ) : null}
      </Section>

      <Section title="Contratos">
        {data.contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ningún contrato tuvo depósitos, entregas ni pagos en estas fechas.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead className="hidden sm:table-cell print:table-cell">
                  {startup ? 'Experto' : 'Startup'}
                </TableHead>
                <TableHead>Metas</TableHead>
                <TableHead className="hidden sm:table-cell print:table-cell">
                  Entregas
                </TableHead>
                <TableHead className="text-right">Liberado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.contracts.map((contract) => (
                <TableRow key={contract.contractId}>
                  <TableCell className="whitespace-normal">
                    <Link
                      href={`/contracts/${contract.contractId}/report`}
                      className="font-medium text-navy underline-offset-2 hover:underline"
                    >
                      {contract.jobTitle}
                    </Link>
                    <StatusBadge
                      status={contract.status}
                      className="mt-1 block w-fit print:hidden"
                    />
                  </TableCell>
                  <TableCell className="hidden whitespace-normal sm:table-cell print:table-cell">
                    {contract.counterpart ?? '-'}
                  </TableCell>
                  <TableCell>
                    {contract.kpis.withTarget > 0
                      ? `${contract.kpis.met} de ${contract.kpis.withTarget}`
                      : '-'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell print:table-cell">
                    {contract.milestonesDelivered}
                  </TableCell>
                  <TableCell className="text-right">
                    {amount(contract.released)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Pagos (comprobables en Stellar)">
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No se liberó ningún pago en estas fechas.
          </p>
        ) : (
          <>
            <ul className="space-y-2 sm:hidden print:hidden">
              {data.payments.map((payment) => (
                <li
                  key={payment.txHash}
                  className="rounded-xl border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-navy">
                      {shortDay(payment.confirmedAt)} · {payment.jobTitle}
                    </p>
                    <span className="font-semibold text-navy">
                      {usdc(payment.amount)}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Hito {payment.milestonePosition + 1}
                    {payment.kind === 'resolve' ? ' · disputa' : ''}
                    {payment.breakdown
                      ? ` · Experto ${amount(payment.breakdown.specialist)}`
                      : ''}
                  </p>
                  <a
                    href={explorerTx(payment.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 underline"
                  >
                    Ver en stellar.expert <ExternalLinkIcon className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block print:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Experto</TableHead>
                    <TableHead className="text-right">Comisiones</TableHead>
                    {refunds ? (
                      <TableHead className="text-right">Startup</TableHead>
                    ) : null}
                    <TableHead>Transacción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((payment) => (
                    <TableRow key={payment.txHash}>
                      <TableCell>{shortDay(payment.confirmedAt)}</TableCell>
                      <TableCell className="whitespace-normal">
                        {payment.jobTitle}
                        <span className="block text-xs text-muted-foreground">
                          Hito {payment.milestonePosition + 1}
                          {payment.kind === 'resolve' ? ' · disputa' : ''}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {amount(payment.amount)}
                      </TableCell>
                      {payment.breakdown ? (
                        <>
                          <TableCell className="text-right">
                            {amount(payment.breakdown.specialist)}
                          </TableCell>
                          <TableCell className="text-right">
                            {amount(
                              String(
                                Number(payment.breakdown.pocket) +
                                  Number(payment.breakdown.trustlessWork),
                              ),
                            )}
                          </TableCell>
                          {refunds ? (
                            <TableCell className="text-right">
                              {amount(payment.breakdown.startup)}
                            </TableCell>
                          ) : null}
                        </>
                      ) : (
                        <TableCell
                          colSpan={refunds ? 3 : 2}
                          className="text-xs text-muted-foreground"
                        >
                          Leyendo el desglose de Stellar...
                        </TableCell>
                      )}
                      <TableCell>
                        <a
                          href={explorerTx(payment.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline"
                        >
                          Ver en stellar.expert{' '}
                          <ExternalLinkIcon className="size-3 print:hidden" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Montos en USDC. Las comisiones son la de Pocket y la de Trustless Work; el CSV
          las trae por separado.
        </p>
      </Section>

      <footer className="space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
        <p>
          Los resultados los reportó cada experto y la startup los aceptó al aprobar la
          entrega. Los pagos se leyeron de la red Stellar: cada uno se puede comprobar con
          su transacción. Las fechas van en UTC.
        </p>
        <p>
          Generado el {dateTime(data.generatedAt)} para{' '}
          {user.role === 'startup' ? 'la startup' : 'el experto'}.
        </p>
      </footer>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <h2 className="text-xl font-bold text-navy">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-xl bg-muted/50 px-4 py-3 font-medium text-navy">{children}</li>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-navy">{usdc(value)}</dd>
    </div>
  );
}

/** Saves the period's payments as a CSV for accounting. */
function CsvButton({ period }: { period: Period }) {
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const blob = await download(
        `/reports/period/csv?from=${period.from}&to=${period.to}`,
      );
      saveFile(blob, 'text/csv', `pocket-pagos-${period.from}-a-${period.to}.csv`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}>
      <DownloadIcon /> {busy ? 'Descargando...' : 'Pagos en CSV'}
    </Button>
  );
}

'use client';

import type { User } from '@pocket/shared';
import { DownloadIcon, ExternalLinkIcon, PrinterIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { KpiOutcomeBadge, kpiTarget } from '@/components/contract/kpi-report';
import {
  TIMING_LABELS,
  goalsLine,
  kpiResultText,
  useContractReport,
} from '@/components/contract/results';
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
import { download, errorMessage } from '@/lib/api';
import { saveFile } from '@/lib/files';
import { date, dateTime, explorerTx, usdc } from '@/lib/format';

export default function ReportPage() {
  return (
    <RequireAuth roles={['startup', 'specialist', 'manager']}>
      {(user) => <Report user={user} />}
    </RequireAuth>
  );
}

/** A timestamp as the reader's calendar day. */
function day(value: string | null): string {
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

function Report({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>();
  const report = useContractReport(id);

  if (report.isLoading) return <Loading />;
  if (report.error || !report.data)
    return <ErrorAlert error={report.error} title="No se pudo armar el reporte" />;
  const data = report.data;
  const completed = data.contract.status === 'completed';
  const specialist = data.specialist.displayName ?? 'El experto';
  const startup = data.startup.companyName ?? 'la startup';
  // A column for refunds only when a dispute gave the startup something back.
  const refunds = data.payments.some((p) => Number(p.breakdown?.startup ?? 0) > 0);

  return (
    <article className="mx-auto max-w-4xl space-y-8 print:max-w-none print:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/contracts/${id}`} className="text-sm underline">
          Volver al contrato
        </Link>
        <div className="flex flex-wrap gap-2">
          <CsvButton contractId={id} />
          <Button size="sm" onClick={() => window.print()}>
            <PrinterIcon /> Descargar PDF
          </Button>
        </div>
      </div>

      <header className="space-y-2 border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Reporte de resultados · Pocket
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-bold text-navy">{data.job.title}</h1>
          <StatusBadge status={data.contract.status} className="px-3 py-1 text-sm" />
        </div>
        <p className="text-muted-foreground">
          {data.startup.companyName ?? 'Startup'} · {specialist} · Del{' '}
          {day(data.contract.fundedAt ?? data.contract.createdAt)}{' '}
          {data.contract.completedAt ? `al ${day(data.contract.completedAt)}` : 'a hoy'}
        </p>
        {!completed ? (
          <p className="rounded-lg bg-celeste-light/50 px-3 py-2 text-sm text-navy">
            El contrato sigue en curso: este reporte se actualiza con cada entrega y cada
            pago. Queda final cuando se paga el último hito.
          </p>
        ) : null}
      </header>

      <Section title="Resumen">
        <ul className="grid gap-3 sm:grid-cols-2">
          <Fact>{goalsLine(data) ?? 'Sin metas en número'}</Fact>
          <Fact>
            {data.summary.milestones.onTime} de {data.summary.milestones.total} hitos
            entregados a tiempo
            {data.summary.milestones.late > 0
              ? ` · ${data.summary.milestones.late} atrasados`
              : ''}
          </Fact>
          <Fact>
            {data.summary.changeRounds === 0
              ? 'Sin rondas de cambios'
              : `${data.summary.changeRounds} ${data.summary.changeRounds === 1 ? 'ronda' : 'rondas'} de cambios`}
          </Fact>
          <Fact>
            {data.summary.disputes === 0
              ? 'Sin disputas'
              : `${data.summary.disputes} ${data.summary.disputes === 1 ? 'disputa' : 'disputas'}`}
          </Fact>
        </ul>
      </Section>

      <Section title="Dinero">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Money label="Total del contrato" value={data.money.contract} />
          <Money label="Depositado" value={data.money.deposited} />
          <Money label="Liberado" value={data.money.released} />
          <Money label={`Recibió ${specialist}`} value={data.money.toSpecialist} />
          <Money label="Comisión de Pocket" value={data.money.pocketFee} />
          <Money label="Comisión de Trustless Work" value={data.money.trustlessWorkFee} />
          {Number(data.money.toStartup) > 0 ? (
            <Money label="Devuelto a la startup" value={data.money.toStartup} />
          ) : null}
          {Number(data.money.inEscrow) > 0 ? (
            <Money label="Todavía en el contrato" value={data.money.inEscrow} />
          ) : null}
        </dl>
        {!data.money.verified ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Algún pago todavía no se pudo leer de Stellar. Vuelve a abrir el reporte en
            unos minutos.
          </p>
        ) : null}
      </Section>

      {data.kpis.length > 0 ? (
        <Section title="Metas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KPI</TableHead>
                <TableHead>Meta</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.kpis.map((kpi) => (
                <TableRow key={kpi.id}>
                  <TableCell className="font-medium text-navy">{kpi.name}</TableCell>
                  <TableCell className="whitespace-normal">{kpiTarget(kpi)}</TableCell>
                  <TableCell className="whitespace-normal">
                    {kpiResultText(kpi)}
                    {kpi.result?.comment ? (
                      <span className="block text-xs text-muted-foreground">
                        {kpi.result.comment}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {kpi.outcome === 'tracked' ? (
                      <span className="text-xs text-muted-foreground">Seguimiento</span>
                    ) : (
                      <KpiOutcomeBadge outcome={kpi.outcome} percent={kpi.percent} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Cada resultado es el de la última entrega que aprobó la startup
            {data.kpis[0]?.result ? ` (${data.kpis[0].result.milestoneTitle})` : ''}.
          </p>
        </Section>
      ) : null}

      <Section title="Hitos">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hito</TableHead>
              <TableHead>Comprometido</TableHead>
              <TableHead>Entregado</TableHead>
              <TableHead>Entregas</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.milestones.map((milestone) => (
              <TableRow key={milestone.id}>
                <TableCell className="whitespace-normal font-medium text-navy">
                  {milestone.position + 1} · {milestone.title}
                </TableCell>
                <TableCell>{date(milestone.dueDate)}</TableCell>
                <TableCell>{day(milestone.firstDeliveredAt)}</TableCell>
                <TableCell>
                  {milestone.deliveries}
                  {milestone.changeRounds > 0
                    ? ` (${milestone.changeRounds} con cambios)`
                    : ''}
                </TableCell>
                <TableCell>
                  {TIMING_LABELS[milestone.timing]}
                  {milestone.disputed ? ' · con disputa' : ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Pagos (comprobables en Stellar)">
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no se liberó ningún pago.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Hito</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Experto</TableHead>
                <TableHead className="text-right">Pocket</TableHead>
                <TableHead className="text-right">Trustless Work</TableHead>
                {refunds ? <TableHead className="text-right">Startup</TableHead> : null}
                <TableHead>Transacción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payments.map((payment) => (
                <TableRow key={payment.txHash}>
                  <TableCell>{day(payment.confirmedAt)}</TableCell>
                  <TableCell>
                    {payment.milestonePosition + 1}
                    {payment.kind === 'resolve' ? ' · disputa' : ''}
                  </TableCell>
                  <TableCell className="text-right">{amount(payment.amount)}</TableCell>
                  {payment.breakdown ? (
                    <>
                      <TableCell className="text-right">
                        {amount(payment.breakdown.specialist)}
                      </TableCell>
                      <TableCell className="text-right">
                        {amount(payment.breakdown.pocket)}
                      </TableCell>
                      <TableCell className="text-right">
                        {amount(payment.breakdown.trustlessWork)}
                      </TableCell>
                      {refunds ? (
                        <TableCell className="text-right">
                          {amount(payment.breakdown.startup)}
                        </TableCell>
                      ) : null}
                    </>
                  ) : (
                    <TableCell
                      colSpan={refunds ? 4 : 3}
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
        )}
        <p className="mt-2 text-xs text-muted-foreground">Montos en USDC.</p>
      </Section>

      <footer className="space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
        <p>
          Los resultados los reportó {specialist} y {startup} los aceptó al aprobar cada
          entrega. Los pagos se leyeron de la red Stellar: cada uno se puede comprobar con
          su transacción.
        </p>
        <p>
          Generado el {dateTime(data.generatedAt)} para{' '}
          {user.role === 'manager' ? 'el equipo de Pocket' : 'las partes del contrato'}.
        </p>
      </footer>
    </article>
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

/** Saves the payments as a CSV for accounting. */
function CsvButton({ contractId }: { contractId: string }) {
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const blob = await download(`/contracts/${contractId}/report/csv`);
      saveFile(blob, 'text/csv', `pocket-pagos-${contractId.slice(0, 8)}.csv`);
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

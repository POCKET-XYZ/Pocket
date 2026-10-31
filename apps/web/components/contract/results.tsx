'use client';

import type { ContractReport, MilestoneTiming, ReportKpi } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { FileTextIcon } from 'lucide-react';
import Link from 'next/link';
import { KpiOutcomeBadge, kpiTarget, withUnit } from '@/components/contract/kpi-report';
import { Detail } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { usdc } from '@/lib/format';

/** The results report of a contract, refreshed with the contract itself. */
export function useContractReport(contractId: string) {
  return useQuery({
    // Under the contract's key, so every action on the contract refreshes it.
    queryKey: ['contracts', contractId, 'report'],
    queryFn: () => api<ContractReport>(`/contracts/${contractId}/report`),
  });
}

export const TIMING_LABELS: Record<MilestoneTiming, string> = {
  on_time: 'A tiempo',
  late: 'Atrasado',
  upcoming: 'Por entregar',
};

/** A KPI's result as people read it: the number with its unit, or the text. */
export function kpiResultText(kpi: ReportKpi): string {
  if (!kpi.result) return 'Sin entrega aprobada';
  return kpi.result.numericValue !== null
    ? withUnit(kpi.result.numericValue, kpi.unit)
    : kpi.result.value;
}

/** "2 de 3 metas cumplidas", or null when no KPI has a numeric target. */
export function goalsLine(report: ContractReport): string | null {
  const { withTarget, met } = report.summary.kpis;
  if (withTarget === 0) return null;
  return `${met} de ${withTarget} ${withTarget === 1 ? 'meta cumplida' : 'metas cumplidas'}`;
}

/**
 * How the contract is going, on its page: money, milestones against their
 * dates and each KPI against its target, with the way to the full report.
 */
export function ResultsCard({ contractId }: { contractId: string }) {
  const report = useContractReport(contractId);
  if (!report.data) return null;
  const data = report.data;
  const completed = data.contract.status === 'completed';
  const { milestones } = data.summary;
  const goals = goalsLine(data);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Resultados</CardTitle>
        <Button asChild variant={completed ? 'default' : 'outline'} size="sm">
          <Link href={`/contracts/${contractId}/report`}>
            <FileTextIcon />
            {completed ? 'Ver el reporte final' : 'Ver el reporte'}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Detail label="Dinero">
            {usdc(data.money.released)} liberado de {usdc(data.money.deposited)}
            {Number(data.money.inEscrow) > 0
              ? ` · ${usdc(data.money.inEscrow)} en el contrato`
              : ''}
          </Detail>
          <Detail label="Hitos">
            {milestones.done} de {milestones.total} completados · {milestones.onTime} a
            tiempo
            {milestones.late > 0 ? ` · ${milestones.late} atrasados` : ''}
          </Detail>
          <Detail label="Metas">{goals ?? 'Sin metas en número'}</Detail>
        </div>

        {data.kpis.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {data.kpis.map((kpi) => (
              <li
                key={kpi.id}
                className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div>
                  <p className="font-medium text-navy">{kpi.name}</p>
                  <p className="text-xs text-muted-foreground">Meta: {kpiTarget(kpi)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="font-semibold text-navy">{kpiResultText(kpi)}</span>
                  <KpiOutcomeBadge outcome={kpi.outcome} percent={kpi.percent} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Cada resultado es el de la última entrega que aprobó la startup.
        </p>
      </CardContent>
    </Card>
  );
}

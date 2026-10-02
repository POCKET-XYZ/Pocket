import type { JobKpi } from '@pocket/shared';

/** A KPI's target with its unit, e.g. "50 per month (leads)". */
export function kpiTarget(kpi: JobKpi): string {
  if (!kpi.target) return kpi.unit ? `No target set (${kpi.unit})` : 'No target set';
  return kpi.unit ? `${kpi.target} (${kpi.unit})` : kpi.target;
}

/** What a job is measured on, as the startup listed it. */
export function KpiList({ kpis }: { kpis: JobKpi[] }) {
  return (
    <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
      {kpis.map((kpi) => (
        <li
          key={kpi.id}
          className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <span className="font-medium text-navy">{kpi.name}</span>
          <span className="text-muted-foreground">Target: {kpiTarget(kpi)}</span>
        </li>
      ))}
    </ul>
  );
}

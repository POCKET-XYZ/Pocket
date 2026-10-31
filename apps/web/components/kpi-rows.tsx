'use client';

import type { JobKpiInput, KpiDirection } from '@pocket/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** The most KPIs a job or a template can have. */
export const MAX_KPIS = 10;

/** How a KPI is measured: against a floor, against a ceiling, or not at all. */
export type KpiMode = KpiDirection | 'tracked';

export const KPI_MODE_LABELS: Record<KpiMode, string> = {
  more_is_better: 'Más es mejor',
  less_is_better: 'Menos es mejor',
  tracked: 'Solo seguimiento',
};

/** A KPI row being edited: every field as typed. */
export interface KpiDraft {
  name: string;
  /** The numeric target as typed; unused when the KPI is only tracked. */
  target: string;
  mode: KpiMode;
  unit: string;
}

export const EMPTY_KPI: KpiDraft = {
  name: '',
  target: '',
  mode: 'more_is_better',
  unit: '',
};

/**
 * Rows to edit, from KPIs saved in a template or posted with a job. A text
 * target from before targets were numbers is kept when it is a plain number,
 * as a floor the startup can change; anything else becomes tracked only.
 */
export function kpiDrafts(kpis: JobKpiInput[]): KpiDraft[] {
  return kpis.map((kpi) => {
    if (kpi.targetValue !== undefined && kpi.direction) {
      return {
        name: kpi.name,
        target: String(kpi.targetValue),
        mode: kpi.direction,
        unit: kpi.unit ?? '',
      };
    }
    const legacy = kpi.target?.trim() ?? '';
    const isNumber = /^\d+(\.\d+)?$/.test(legacy);
    return {
      name: kpi.name,
      target: isNumber ? legacy : '',
      mode: isNumber ? 'more_is_better' : 'tracked',
      unit: kpi.unit ?? '',
    };
  });
}

/** The rows as the API takes them: trimmed, without empty optional parts. */
export function kpiInputs(drafts: KpiDraft[]): JobKpiInput[] {
  return drafts.map((kpi) => ({
    name: kpi.name.trim(),
    ...(kpi.mode !== 'tracked' && kpi.target.trim() !== ''
      ? { targetValue: Number(kpi.target), direction: kpi.mode }
      : {}),
    ...(kpi.unit.trim() ? { unit: kpi.unit.trim() } : {}),
  }));
}

/** A name listed twice, ignoring case, as the API would refuse it, or null. */
export function repeatedKpi(drafts: KpiDraft[]): string | null {
  const names = drafts.map((kpi) => kpi.name.trim().toLowerCase());
  return names.find((name, i) => name && names.indexOf(name) !== i) ?? null;
}

/**
 * The KPI rows of a job or a template: a name, how it is measured, a numeric
 * target unless it is only tracked, and a unit each.
 */
export function KpiRows({
  kpis,
  onChange,
}: {
  kpis: KpiDraft[];
  onChange: (kpis: KpiDraft[]) => void;
}) {
  function update(index: number, patch: Partial<KpiDraft>) {
    onChange(kpis.map((kpi, i) => (i === index ? { ...kpi, ...patch } : kpi)));
  }

  return (
    <>
      {kpis.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Con una meta en número, el reporte final dice si se cumplió. Usa &quot;Menos es
          mejor&quot; para costos, por ejemplo el costo por lead.
        </p>
      ) : null}
      {kpis.map((kpi, index) => (
        <div key={index} className="flex items-start gap-2 rounded-xl bg-muted/40 p-3">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[2fr_1.3fr_1fr_1fr]">
            <Input
              aria-label={`Nombre del KPI ${index + 1}`}
              placeholder="Nombre, por ejemplo Leads calificados"
              required
              minLength={2}
              maxLength={80}
              value={kpi.name}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <select
              aria-label={`Cómo se mide el KPI ${index + 1}`}
              value={kpi.mode}
              onChange={(event) => update(index, { mode: event.target.value as KpiMode })}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              {Object.entries(KPI_MODE_LABELS).map(([mode, label]) => (
                <option key={mode} value={mode}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              aria-label={`Meta del KPI ${index + 1}`}
              type="number"
              inputMode="decimal"
              min={kpi.mode === 'more_is_better' ? 0.0000001 : 0}
              step="any"
              placeholder={kpi.mode === 'tracked' ? 'Sin meta' : 'Meta, por ejemplo 100'}
              required={kpi.mode !== 'tracked'}
              disabled={kpi.mode === 'tracked'}
              value={kpi.mode === 'tracked' ? '' : kpi.target}
              onChange={(event) => update(index, { target: event.target.value })}
            />
            <Input
              aria-label={`Unidad del KPI ${index + 1}`}
              placeholder="Unidad, por ejemplo leads"
              maxLength={30}
              value={kpi.unit}
              onChange={(event) => update(index, { unit: event.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Quitar KPI"
            onClick={() => onChange(kpis.filter((_, i) => i !== index))}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}

      {kpis.length < MAX_KPIS ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...kpis, { ...EMPTY_KPI }])}
        >
          <PlusIcon /> Agregar KPI
        </Button>
      ) : null}
    </>
  );
}

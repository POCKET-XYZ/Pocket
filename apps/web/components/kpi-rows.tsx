'use client';

import type { JobKpiInput } from '@pocket/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** The most KPIs a job or a template can have. */
export const MAX_KPIS = 10;

/** A KPI row being edited: every field as typed. */
export interface KpiDraft {
  name: string;
  target: string;
  unit: string;
}

export const EMPTY_KPI: KpiDraft = { name: '', target: '', unit: '' };

/** Rows to edit, from KPIs saved in a template or posted with a job. */
export function kpiDrafts(kpis: JobKpiInput[]): KpiDraft[] {
  return kpis.map((kpi) => ({
    name: kpi.name,
    target: kpi.target ?? '',
    unit: kpi.unit ?? '',
  }));
}

/** The rows as the API takes them: trimmed, without empty optional parts. */
export function kpiInputs(drafts: KpiDraft[]): JobKpiInput[] {
  return drafts.map((kpi) => ({
    name: kpi.name.trim(),
    ...(kpi.target.trim() ? { target: kpi.target.trim() } : {}),
    ...(kpi.unit.trim() ? { unit: kpi.unit.trim() } : {}),
  }));
}

/** A name listed twice, ignoring case, as the API would refuse it, or null. */
export function repeatedKpi(drafts: KpiDraft[]): string | null {
  const names = drafts.map((kpi) => kpi.name.trim().toLowerCase());
  return names.find((name, i) => name && names.indexOf(name) !== i) ?? null;
}

/** The KPI rows of a job or a template: a name, a target and a unit each. */
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
      {kpis.map((kpi, index) => (
        <div key={index} className="flex items-start gap-2 rounded-xl bg-muted/40 p-3">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[2fr_1.5fr_1fr]">
            <Input
              aria-label={`KPI ${index + 1} name`}
              placeholder="Name, e.g. Qualified leads"
              required
              minLength={2}
              maxLength={80}
              value={kpi.name}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <Input
              aria-label={`KPI ${index + 1} target`}
              placeholder="Target, e.g. 50 per month"
              maxLength={80}
              value={kpi.target}
              onChange={(event) => update(index, { target: event.target.value })}
            />
            <Input
              aria-label={`KPI ${index + 1} unit`}
              placeholder="Unit, e.g. leads"
              maxLength={30}
              value={kpi.unit}
              onChange={(event) => update(index, { unit: event.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove KPI"
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
          <PlusIcon /> Add KPI
        </Button>
      ) : null}
    </>
  );
}

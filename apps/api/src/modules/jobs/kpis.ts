import { BadRequestException } from '@nestjs/common';
import type { KpiDirection } from '@prisma/client';

/**
 * A KPI as stored: trimmed, without empty optional parts. A type rather than
 * an interface, so a list of them is also a JSON value Prisma can store.
 */
export type CleanKpi = {
  name: string;
  targetValue?: number;
  direction?: KpiDirection;
  target?: string;
  unit?: string;
};

/**
 * The KPIs as stored, on a job or in a template: trimmed, without empty
 * optional parts, and each name once ignoring case, since every delivery
 * reports one result per KPI by name. A numeric target always says which way
 * is better, and a target of 0 can only be a ceiling.
 */
export function cleanKpis(list: readonly CleanKpi[] | undefined): CleanKpi[] {
  const kpis = (list ?? []).map((kpi) => ({
    name: kpi.name.trim(),
    ...(kpi.targetValue !== undefined ? { targetValue: kpi.targetValue } : {}),
    ...(kpi.direction ? { direction: kpi.direction } : {}),
    ...(kpi.target?.trim() ? { target: kpi.target.trim() } : {}),
    ...(kpi.unit?.trim() ? { unit: kpi.unit.trim() } : {}),
  }));
  const seen = new Set<string>();
  for (const kpi of kpis) {
    if (kpi.name.length < 2) {
      throw new BadRequestException(
        'Cada KPI necesita un nombre de al menos 2 caracteres',
      );
    }
    const key = kpi.name.toLowerCase();
    if (seen.has(key)) {
      throw new BadRequestException(`"${kpi.name}" aparece dos veces como KPI`);
    }
    seen.add(key);
    if ((kpi.targetValue === undefined) !== (kpi.direction === undefined)) {
      throw new BadRequestException(
        `En "${kpi.name}", la meta y si más o menos es mejor van juntas`,
      );
    }
    if (kpi.targetValue === 0 && kpi.direction === 'more_is_better') {
      throw new BadRequestException(
        `En "${kpi.name}", una meta de 0 solo tiene sentido si menos es mejor`,
      );
    }
  }
  return kpis;
}

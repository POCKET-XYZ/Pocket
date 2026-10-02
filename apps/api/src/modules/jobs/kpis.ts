import { BadRequestException } from '@nestjs/common';

/**
 * A KPI as stored: trimmed, without empty optional parts. A type rather than
 * an interface, so a list of them is also a JSON value Prisma can store.
 */
export type CleanKpi = {
  name: string;
  target?: string;
  unit?: string;
};

/**
 * The KPIs as stored, on a job or in a template: trimmed, without empty
 * optional parts, and each name once ignoring case, since every delivery
 * reports one result per KPI by name.
 */
export function cleanKpis(
  list: readonly { name: string; target?: string; unit?: string }[] | undefined,
): CleanKpi[] {
  const kpis = (list ?? []).map((kpi) => ({
    name: kpi.name.trim(),
    ...(kpi.target?.trim() ? { target: kpi.target.trim() } : {}),
    ...(kpi.unit?.trim() ? { unit: kpi.unit.trim() } : {}),
  }));
  const seen = new Set<string>();
  for (const kpi of kpis) {
    if (kpi.name.length < 2) {
      throw new BadRequestException('Give every KPI a name of at least 2 characters');
    }
    const key = kpi.name.toLowerCase();
    if (seen.has(key)) {
      throw new BadRequestException(`"${kpi.name}" is listed twice as a KPI`);
    }
    seen.add(key);
  }
  return kpis;
}

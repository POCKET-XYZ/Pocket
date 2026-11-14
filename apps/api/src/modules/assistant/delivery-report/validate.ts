import { findNumbers, textHasNumber } from '../numbers';
import { fitLength, textProblem } from '../text-checks';
import type { RawDeliveryReport } from './schema';

/**
 * The checks on a delivery report before it is shown: a number counts only
 * when the expert's notes hold it, and the note says nothing the notes do
 * not. A KPI without its number in the notes stays empty, with a note.
 */

/** The delivery note's limit, as the form takes it. */
const NOTE_LIMITS = [10, 2000] as const;

type Language = RawDeliveryReport['language'];

const NOT_FOUND: Record<Language, string> = {
  es: 'No encontré este dato en tus notas.',
  pt: 'Não encontrei este dado nas suas notas.',
  en: "I couldn't find this in your notes.",
};

export interface JobKpiForReport {
  id: string;
  name: string;
  unit: string | null;
}

export interface ReportKpi {
  kpiId: string;
  name: string;
  /** The number from the notes, or null when they do not give it. */
  value: number | null;
  /** Why it is empty, in the expert's language. */
  warning: string | null;
}

export interface DeliveryReport {
  note: string | null;
  kpis: ReportKpi[];
}

/**
 * The note as the form takes it, or null when it says a number the notes do
 * not hold, or promises a result.
 */
export function checkNote(note: string, notes: string): string | null {
  const fitted = fitLength(note, ...NOTE_LIMITS);
  if (fitted === null) return null;
  if (textProblem(fitted) === 'promise') return null;
  const invented = findNumbers(fitted).some((found) => !textHasNumber(notes, found.value));
  return invented ? null : fitted;
}

/** Whether the first answer needs asking again: its note did not pass. */
export function reportNeedsRetry(raw: RawDeliveryReport, notes: string): boolean {
  return checkNote(raw.note, notes) === null;
}

export function finishReport(
  raw: RawDeliveryReport,
  retry: RawDeliveryReport | null,
  notes: string,
  kpis: JobKpiForReport[],
): DeliveryReport {
  const note = checkNote(raw.note, notes) ?? (retry ? checkNote(retry.note, notes) : null);
  const language = raw.language;
  return {
    note,
    // Every KPI of the job, in its order, whatever the model listed.
    kpis: kpis.map((kpi) => {
      const given = raw.kpi_values.find((entry) => entry.kpi_id === kpi.id);
      const value =
        given && given.value !== null && Number.isFinite(given.value) && textHasNumber(notes, given.value)
          ? given.value
          : null;
      return {
        kpiId: kpi.id,
        name: kpi.name,
        value,
        warning: value === null ? NOT_FOUND[language] : null,
      };
    }),
  };
}

export function reportHasContent(report: DeliveryReport): boolean {
  return report.note !== null || report.kpis.some((kpi) => kpi.value !== null);
}

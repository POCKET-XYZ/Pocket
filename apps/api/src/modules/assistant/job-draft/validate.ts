import type { CleanKpi } from '../../jobs/kpis';
import { readBudget, shareOut, type BudgetReading } from '../numbers';
import { fitLength, textProblem } from '../text-checks';
import type { RawJobDraft } from './schema';

/**
 * The checks in code that run on every job draft before it is shown: what
 * breaks a rule never reaches the screen. The budget is read here from the
 * company's own text and shared out by the model's weights; the model never
 * writes an amount.
 */

/** The form's limits, from the job's DTO, so a suggestion always fits. */
export const LIMITS = {
  title: [10, 120],
  description: [50, 5000],
  deliverables: [10, 2000],
  milestoneTitle: [3, 120],
  milestoneDescription: [10, 2000],
  acceptanceCriteria: [10, 2000],
  kpiName: [2, 80],
  kpiUnit: [1, 30],
} as const;

const MAX_MILESTONES = 5;
const MAX_KPIS = 10;
const MAX_WARNINGS = 4;
const MAX_QUESTIONS = 2;

export type Language = 'es' | 'pt' | 'en';

export interface DraftMilestone {
  title: string;
  description: string;
  acceptanceCriteria: string;
  /** Null without a budget written plainly: the company sets it. */
  amount: number | null;
}

export interface DraftKpi extends CleanKpi {
  /** The saved template it was taken from, or none for a new KPI. */
  templateId: string | null;
}

export interface JobDraft {
  title: string | null;
  description: string | null;
  deliverables: string | null;
  milestones: DraftMilestone[];
  kpis: DraftKpi[];
  warnings: string[];
  /** The total the amounts share out, when the company wrote one. */
  budget: number | null;
}

/** A part checked on its own: shown as soon as it passes, held back if not. */
export type PartKey = 'title' | 'description' | 'deliverables' | `milestone:${number}`;

export interface SavedTemplate {
  id: string;
  kpis: CleanKpi[];
}

/** A text part as the form takes it, or why it cannot be shown. */
export type CheckedText = { ok: true; value: string } | { ok: false; reason: string };

export function checkText(text: string, [min, max]: readonly [number, number]): CheckedText {
  const fitted = fitLength(text, min, max);
  if (fitted === null) return { ok: false, reason: 'length' };
  const problem = textProblem(fitted);
  return problem ? { ok: false, reason: problem } : { ok: true, value: fitted };
}

/** The criteria as one text, a line each, as the form's field holds them. */
function criteriaText(criteria: string[]): string {
  return criteria
    .map((criterion) => criterion.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((criterion) => `- ${criterion}`)
    .join('\n');
}

export type CheckedMilestone =
  | { ok: true; value: Omit<DraftMilestone, 'amount'>; weight: number }
  | { ok: false; reason: string };

export function checkMilestone(milestone: RawJobDraft['milestones'][number]): CheckedMilestone {
  const title = checkText(milestone.title, LIMITS.milestoneTitle);
  const description = checkText(milestone.description, LIMITS.milestoneDescription);
  const criteria = checkText(criteriaText(milestone.acceptance_criteria), LIMITS.acceptanceCriteria);
  if (!title.ok) return title;
  if (!description.ok) return description;
  if (!criteria.ok) return criteria;
  const weight = Number.isInteger(milestone.weight)
    ? Math.min(10, Math.max(1, milestone.weight))
    : 1;
  return {
    ok: true,
    value: { title: title.value, description: description.value, acceptanceCriteria: criteria.value },
    weight,
  };
}

/** One part of a raw draft, checked: what the stream shows as soon as it is complete. */
export function checkPart(raw: RawJobDraft, key: PartKey): CheckedText | CheckedMilestone {
  if (key === 'title') return checkText(raw.title, LIMITS.title);
  if (key === 'description') return checkText(raw.description, LIMITS.description);
  if (key === 'deliverables') return checkText(raw.deliverables, LIMITS.deliverables);
  const index = Number(key.split(':')[1]);
  const milestone = raw.milestones[index];
  return milestone ? checkMilestone(milestone) : { ok: false, reason: 'missing' };
}

/** The parts of a draft that failed their checks, to ask once more for. */
export function failedParts(raw: RawJobDraft): PartKey[] {
  const keys: PartKey[] = ['title', 'description', 'deliverables'];
  raw.milestones.slice(0, MAX_MILESTONES).forEach((_, index) => keys.push(`milestone:${index}`));
  return keys.filter((key) => !checkPart(raw, key).ok);
}

/**
 * KPIs taken from the company's own templates, copied with their targets as
 * the company saved them, or new ones without a target. A template that is
 * not theirs, or a name it does not hold, is dropped.
 */
export function checkKpis(raw: RawJobDraft['kpis'], templates: SavedTemplate[]): DraftKpi[] {
  const kpis: DraftKpi[] = [];
  const seen = new Set<string>();
  for (const kpi of raw) {
    let picked: DraftKpi | null = null;
    if (kpi.template_id !== null) {
      const template = templates.find((saved) => saved.id === kpi.template_id);
      const saved = template?.kpis.find(
        (candidate) => candidate.name.trim().toLowerCase() === kpi.name.trim().toLowerCase(),
      );
      if (template && saved) picked = { ...saved, templateId: template.id };
    } else {
      const name = checkText(kpi.name, LIMITS.kpiName);
      const unit = kpi.unit ? fitLength(kpi.unit, ...LIMITS.kpiUnit) : null;
      if (name.ok) {
        // Which way is better, but never a target: the form asks the
        // company for it.
        picked = {
          name: name.value,
          ...(unit && !textProblem(unit) ? { unit } : {}),
          ...(kpi.direction ? { direction: kpi.direction } : {}),
          templateId: null,
        };
      }
    }
    if (!picked) continue;
    const key = picked.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kpis.push(picked);
    if (kpis.length === MAX_KPIS) break;
  }
  return kpis;
}

/** What Pocket says about the budget, in the company's language. */
type BudgetNote = 'none' | Extract<BudgetReading, { kind: 'unclear' }>['reason'];

export const BUDGET_WARNINGS: Record<BudgetNote, Record<Language, string>> = {
  none: {
    es: 'No dijiste tu presupuesto: pon tú los montos de cada hito.',
    pt: 'Você não disse seu orçamento: coloque você os valores de cada etapa.',
    en: "You didn't give a budget: set the amount of each milestone yourself.",
  },
  range: {
    es: 'Dinos un monto total, no un rango, para repartirlo entre los hitos.',
    pt: 'Diga um valor total, não uma faixa, para dividi-lo entre as etapas.',
    en: 'Give one total, not a range, to share it out across the milestones.',
  },
  per_unit: {
    es: '¿Cuál es tu presupuesto total? Escríbelo para repartirlo entre los hitos.',
    pt: 'Qual é o seu orçamento total? Escreva-o para dividi-lo entre as etapas.',
    en: "What's your total budget? Write it to share it out across the milestones.",
  },
  other_currency: {
    es: 'Los pagos en Pocket son en USDC: escribe tu presupuesto en USDC para repartirlo.',
    pt: 'Os pagamentos na Pocket são em USDC: escreva seu orçamento em USDC para dividi-lo.',
    en: 'Payments on Pocket are in USDC: write your budget in USDC to share it out.',
  },
  several: {
    es: 'Escribiste más de un monto: dinos el total para repartirlo entre los hitos.',
    pt: 'Você escreveu mais de um valor: diga o total para dividi-lo entre as etapas.',
    en: 'You wrote more than one amount: give the total to share it out.',
  },
};

export const DATES_WARNING: Record<Language, string> = {
  es: 'Pon tú las fechas de entrega de cada hito.',
  pt: 'Coloque você as datas de entrega de cada etapa.',
  en: 'Set the due date of each milestone yourself.',
};

/**
 * The whole draft, checked: the parts that pass, the amounts from the
 * company's own budget, and the notes on what is missing. `retry` holds the
 * second answer when the first had parts that failed; a part that fails in
 * both is left out.
 */
export function finishDraft(
  raw: RawJobDraft,
  retry: RawJobDraft | null,
  request: string,
  templates: SavedTemplate[],
): JobDraft {
  const language: Language = raw.language;
  const pick = (key: PartKey) => {
    const first = checkPart(raw, key);
    if (first.ok || !retry) return first;
    return checkPart(retry, key);
  };
  const textOf = (key: 'title' | 'description' | 'deliverables') => {
    const checked = pick(key) as CheckedText;
    return checked.ok ? checked.value : null;
  };

  const kept: Array<{ value: Omit<DraftMilestone, 'amount'>; weight: number }> = [];
  raw.milestones.slice(0, MAX_MILESTONES).forEach((_, index) => {
    const checked = pick(`milestone:${index}`) as CheckedMilestone;
    if (checked.ok) kept.push({ value: checked.value, weight: checked.weight });
  });

  const budget = readBudget(request);
  const amounts =
    budget.kind === 'total' && kept.length > 0
      ? shareOut(
          budget.amount,
          kept.map((milestone) => milestone.weight),
        )
      : [];
  const milestones = kept.map((milestone, index) => ({
    ...milestone.value,
    amount: amounts[index] ?? null,
  }));

  const warnings = raw.warnings
    .map((warning) => fitLength(warning, 5, 200))
    .filter((warning): warning is string => warning !== null && !textProblem(warning))
    .slice(0, MAX_WARNINGS);
  if (budget.kind === 'none') warnings.push(BUDGET_WARNINGS.none[language]);
  if (budget.kind === 'unclear') warnings.push(BUDGET_WARNINGS[budget.reason][language]);
  if (milestones.length > 0) warnings.push(DATES_WARNING[language]);

  return {
    title: textOf('title'),
    description: textOf('description'),
    deliverables: textOf('deliverables'),
    milestones,
    kpis: checkKpis(raw.kpis, templates),
    warnings,
    budget: budget.kind === 'total' && milestones.length > 0 ? budget.amount : null,
  };
}

/** The questions back, when the model asked instead of drafting. */
export function checkQuestions(raw: RawJobDraft): string[] {
  return raw.questions
    .map((question) => fitLength(question, 5, 200))
    .filter((question): question is string => question !== null)
    .slice(0, MAX_QUESTIONS);
}

/** Whether anything worth showing is left after the checks. */
export function hasContent(draft: JobDraft): boolean {
  return Boolean(draft.title || draft.description || draft.deliverables || draft.milestones.length > 0);
}

/**
 * Numbers and money as people write them in Spanish, Portuguese and English.
 * The assistant never decides what a budget is: this code reads it from the
 * text, and only an amount written plainly as a total counts. The same
 * reading checks that a number in a report was really in the notes.
 */

/** A number found in a text, with where it is and its value. */
export interface FoundNumber {
  value: number;
  raw: string;
  start: number;
  end: number;
}

// Digits grouped by thousands ("1.500", "1,500,000"), or plain, with an
// optional decimal part, then an optional multiplier: "12 mil", "12k", "1,2
// millones". Not inside a word or a longer number.
const NUMBER =
  /(?<![\p{L}\p{N}.,])(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(\s?(?:k|mil|millones|millón|millon|milhões|milhão|million|millions|m)\b)?/giu;

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  mil: 1_000,
  m: 1_000_000,
  millones: 1_000_000,
  millón: 1_000_000,
  millon: 1_000_000,
  milhões: 1_000_000,
  milhão: 1_000_000,
  million: 1_000_000,
  millions: 1_000_000,
};

/**
 * The value of digits as written. With both separators, the last one is the
 * decimal point. With one kind used several times, or once before exactly
 * three digits, it groups thousands ("1.500" and "1,500" are 1500); otherwise
 * it is the decimal point ("12,5" and "12.5" are 12.5).
 */
export function parseDigits(raw: string): number {
  const dots = (raw.match(/\./g) ?? []).length;
  const commas = (raw.match(/,/g) ?? []).length;
  let normalized = raw;
  if (dots > 0 && commas > 0) {
    const decimal = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalized = raw.split(thousands).join('').replace(decimal, '.');
  } else if (dots + commas > 0) {
    const separator = dots > 0 ? '.' : ',';
    const count = dots + commas;
    const after = raw.length - raw.lastIndexOf(separator) - 1;
    normalized =
      count > 1 || after === 3 ? raw.split(separator).join('') : raw.replace(separator, '.');
  }
  return Number(normalized);
}

/** Every number written with digits in the text, in order. Number words are left out. */
export function findNumbers(text: string): FoundNumber[] {
  const found: FoundNumber[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const multiplier = match[2] ? MULTIPLIERS[match[2].trim().toLowerCase()] : 1;
    const value = parseDigits(match[1]) * (multiplier ?? 1);
    if (!Number.isFinite(value)) continue;
    const start = match.index ?? 0;
    found.push({ value, raw: match[0], start, end: start + match[0].length });
  }
  return found;
}

/** Whether a number with this value is written in the text, in any of its usual forms. */
export function textHasNumber(text: string, value: number): boolean {
  return findNumbers(text).some((found) => Math.abs(found.value - value) < 1e-9);
}

// One end of a range: "entre 300 y 400", "de 300 a 400", "300-400", "between
// 300 and 400". A list ("5 mil, 3 mil y 2 mil") is not a range.
const RANGE_OPEN_BEFORE = /(?:entre|between|de|from|desde)\s*$/i;
const RANGE_JOIN_AFTER = /^\s*(?:mil|k)?\s*(?:y|a|and|to|e|até|hasta)\s*\d/i;
const RANGE_CLOSE_BEFORE =
  /(?:entre|between|de|from|desde)\s+\d[\d.,]*\s*(?:mil|k)?\s*(?:y|a|and|to|e|até|hasta)\s*$/i;
const HYPHEN_AFTER = /^\s*[-–]\s*\d/;
const HYPHEN_BEFORE = /\d\s*[-–]\s*$/;
const PERCENT_AFTER = /^\s*(?:%|por ciento|percent|por cento)/i;

/**
 * Whether the text gives this number on its own, as a result: not as one end
 * of a range, and not as a percentage unless a percentage is what is asked.
 */
export function textGivesNumber(text: string, value: number, percentAsked = false): boolean {
  return findNumbers(text).some((found) => {
    if (Math.abs(found.value - value) >= 1e-9) return false;
    const before = text.slice(Math.max(0, found.start - 30), found.start);
    const after = text.slice(found.end, found.end + 20);
    const inRange =
      (RANGE_OPEN_BEFORE.test(before) && RANGE_JOIN_AFTER.test(after)) ||
      RANGE_CLOSE_BEFORE.test(before) ||
      HYPHEN_AFTER.test(after) ||
      HYPHEN_BEFORE.test(before);
    if (inRange) return false;
    return percentAsked || !PERCENT_AFTER.test(after);
  });
}

// What marks an amount as money paid in dollars, which Pocket pays in USDC.
const DOLLAR_BEFORE = /(?:us\$|\$|usdc|usd)\s*$/i;
const DOLLAR_AFTER = /^\s*(?:usdc|usd|us\$|\$|dólares|dolares|dólar|dolar|dollars|dollar|dls)\b/i;
// Other currencies: never converted, the person is asked for USDC.
const OTHER_BEFORE = /(?:r\$|bs\.?|€|£|s\/\.?|mxn|ars|cop|clp|pen|brl|eur)\s*$/i;
const OTHER_AFTER =
  /^\s*(?:bs\b\.?|bolivianos?\b|reales?\b|reais\b|r\$|pesos?\b|soles?\b|€|euros?\b|eur\b|brl\b|mxn\b|ars\b|cop\b|clp\b|pen\b|gs\b|guaraníes\b)/i;
// "Presupuesto de 300", "budget: 300", "orçamento 300": a total without a currency.
const BUDGET_WORD_BEFORE =
  /(?:presupuesto|budget|orçamento|orcamento)(?:\s+(?:total|máximo|maximo|de|es|is|of|é|do|da))*\s*(?:de|es|is|of|:|=|é)?\s*$/i;

// A range or a cap is not a total to share out.
const RANGE_BEFORE =
  /(?:entre|hasta|máximo|maximo|max\.?|como mucho|a lo sumo|no más de|no mas de|menos de|mínimo|minimo|al menos|up to|at most|at least|between|até|no máximo|cerca de|alrededor de|aprox\.?|aproximadamente|around|about|~)\s*(?:de\s*)?(?:us\$|\$|usdc|usd)?\s*$/i;
// The second end of a range whose first end had no currency: "entre 200 y 300 USDC".
const RANGE_END_BEFORE = /\d\s*(?:-|–|a|y|to|and|ou|o)\s*(?:us\$|\$|usdc|usd)?\s*$/i;
const RANGE_AFTER = /^\s*(?:usdc|usd|dólares|dolares|dollars|\$)?\s*(?:-|–|a|y|to|and|ou|o)\s*(?:us\$|\$|usdc|usd)?\s*\d/i;
// A price per piece, per month or per person is not the total either.
const PER_UNIT_AFTER =
  /^\s*(?:usdc|usd|dólares|dolares|dollars|\$)?\s*(?:por\s+(?:cada\s+)?|(?:a|para|en)\s+cada\s+|cada\s+|c\/u|each|per\s+|a\s+la\s+|al\s+|\/\s*|mensual|semanal|diario|por mes|ao mês|por mês)/i;

// "Presupuesto total 1000", "total: 1000", "1000 USDC en total".
const TOTAL_WORD_BEFORE = /(?:total|en total|in total|no total)\s*(?:de|of|:)?\s*(?:us\$|\$|usdc|usd)?\s*$/i;
const TOTAL_WORD_AFTER =
  /^\s*(?:usdc|usd|dólares|dolares|dollars)?\s*(?:en total|in total|no total|de presupuesto total|total)\b/i;

export type BudgetReading =
  | { kind: 'total'; amount: number }
  | { kind: 'none' }
  | { kind: 'unclear'; reason: 'range' | 'per_unit' | 'other_currency' | 'several' };

/**
 * The budget a startup wrote, if it wrote one total plainly: "tengo 300 USDC",
 * "presupuesto: 300", "$1,500". A range, a cap, a price per unit, an amount in
 * another currency or two different amounts are unclear, and nothing is
 * shared out. Numbers without a currency ("3 videos en 2 semanas") are not
 * money.
 */
export function readBudget(text: string): BudgetReading {
  const totals = new Set<number>();
  // Amounts said to be the total: "presupuesto total 1000", "1000 USDC en total".
  const labeled = new Set<number>();
  let unclear: 'range' | 'per_unit' | 'other_currency' | undefined;
  for (const found of findNumbers(text)) {
    const before = text.slice(Math.max(0, found.start - 40), found.start);
    const after = text.slice(found.end, found.end + 40);
    const near = before.slice(-6);
    if (OTHER_BEFORE.test(near) || OTHER_AFTER.test(after)) {
      unclear = 'other_currency';
      continue;
    }
    const dollars = DOLLAR_BEFORE.test(near) || DOLLAR_AFTER.test(after);
    const budgetWord = BUDGET_WORD_BEFORE.test(before);
    if (!dollars && !budgetWord) continue;
    if (RANGE_BEFORE.test(before) || RANGE_END_BEFORE.test(before) || RANGE_AFTER.test(after)) {
      unclear ??= 'range';
      continue;
    }
    if (PER_UNIT_AFTER.test(after.replace(DOLLAR_AFTER, ''))) {
      unclear ??= 'per_unit';
      continue;
    }
    if (found.value <= 0) continue;
    totals.add(found.value);
    if (budgetWord || TOTAL_WORD_BEFORE.test(before) || TOTAL_WORD_AFTER.test(after)) {
      labeled.add(found.value);
    }
  }
  if (unclear === 'other_currency') return { kind: 'unclear', reason: 'other_currency' };
  // Several amounts, one of them said to be the total: that one. A prize or a
  // part of it written beside the total does not make it unclear.
  if (totals.size > 1 && labeled.size === 1 && unclear !== 'range') {
    return { kind: 'total', amount: [...labeled][0] };
  }
  if (totals.size > 1) return { kind: 'unclear', reason: 'several' };
  if (totals.size === 1 && !unclear) return { kind: 'total', amount: [...totals][0] };
  if (unclear) return { kind: 'unclear', reason: unclear };
  return { kind: 'none' };
}

/** Whether a text mentions money: an amount with a currency, or a currency sign. */
export function mentionsMoney(text: string): boolean {
  if (/(?:us\$|r\$|\$|€|£)\s*\d/i.test(text)) return true;
  if (
    /\d\s*(?:usdc|usd|dólares|dolares|dollars|bs\b|bolivianos|reales|reais|pesos|soles|euros|eur\b)/i.test(
      text,
    )
  ) {
    return true;
  }
  return /\b(?:usdc|usd)\b/i.test(text);
}

/**
 * Shares a total out by weights, in cents, so the parts always add up to the
 * total exactly. What rounding leaves goes to the last part.
 */
export function shareOut(total: number, weights: number[]): number[] {
  const cents = Math.round(total * 100);
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (weights.length === 0 || sum <= 0) return [];
  const parts = weights.map((weight) => Math.floor((cents * weight) / sum));
  parts[parts.length - 1] += cents - parts.reduce((acc, part) => acc + part, 0);
  return parts.map((part) => part / 100);
}

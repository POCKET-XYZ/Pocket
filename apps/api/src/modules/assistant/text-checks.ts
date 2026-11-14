import { mentionsMoney } from './numbers';

/**
 * Checks every text the assistant writes before anyone sees it: no money, no
 * dates and no promised results. The instructions already forbid them; this
 * is what holds when the model slips.
 */
export type TextProblem = 'money' | 'date' | 'promise';

const MONTHS =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|' +
  'janeiro|fevereiro|março|marco|maio|junho|julho|setembro|outubro|novembro|dezembro|' +
  'january|february|march|april|june|july|august|september|october|november|december';
const WEEKDAYS =
  'lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|' +
  'segunda-feira|terça-feira|terca-feira|quarta-feira|quinta-feira|sexta-feira|' +
  'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

const DATE_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:${MONTHS})\\b`, 'i'),
  new RegExp(`\\b(?:${WEEKDAYS})\\b`, 'i'),
  // 15/11, 15-11-2026, 2026-11-15
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  // "el 15 de", "dia 15", "on the 15th"
  /\b(?:el|del|al|dia|día|on the)\s+\d{1,2}(?:st|nd|rd|th)?\s+(?:de\b)?/i,
  /\b(?:mañana|pasado mañana|hoy|esta semana|la próxima semana|la semana que viene|fin de mes|amanhã|hoje|próxima semana|tomorrow|today|next week|this week|end of the month)\b/i,
  /\b(?:navidad|carnaval|semana santa|año nuevo|natal|christmas|easter|black friday|cyber monday)\b/i,
  // When it is due: "en 2 semanas", "dentro de 10 días", "within 3 days".
  /\b(?:en|dentro de|em|within|in)\s+\d+\s+(?:días|dias|semanas|meses|days|weeks|months)\b/i,
];

const PROMISE =
  /garantiz|garanti[mr]|garantía de resultados|guarante|aseguramos|te aseguro|aseguro que|aseguramos que|resultados asegurados|se (?:hará|hara|volverá|volvera) viral|go viral|went viral|vai viralizar|sin falta/i;

export function textProblem(text: string): TextProblem | null {
  if (mentionsMoney(text)) return 'money';
  if (DATE_PATTERNS.some((pattern) => pattern.test(text))) return 'date';
  if (PROMISE.test(text)) return 'promise';
  return null;
}

/**
 * A text cut to a length the form takes, at the last space before it. Null
 * when it is shorter than the form's minimum: the person writes it instead.
 */
export function fitLength(text: string, min: number, max: number): string | null {
  const clean = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length < min) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const fitted = (space > min ? cut.slice(0, space) : cut).trim();
  return fitted.length >= min ? fitted : null;
}

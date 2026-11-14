/**
 * The calendar the assistant's limits run on: days and months in UTC, the
 * same for everyone, so a limit resets at the same moment whatever the
 * person's time zone.
 */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcMidnight(now: Date): Date {
  return new Date(startOfUtcDay(now).getTime() + 86_400_000);
}

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** "2026-11", to tell months apart. */
export function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/**
 * When the daily limit resets, said as people read it: midnight UTC is 8 in
 * the evening in Bolivia, so "tomorrow" would be wrong for many.
 */
export function resetsIn(now: Date): string {
  const minutes = Math.max(1, Math.ceil((nextUtcMidnight(now).getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
}

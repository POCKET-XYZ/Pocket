/**
 * Time zones a specialist picks from, as UTC offsets with the places a startup
 * recognises. Offsets rather than city names: what a startup wants to know is
 * how many hours apart they are.
 */
export const TIME_ZONES: string[] = [
  'UTC-10 · Hawaii',
  'UTC-8 · Los Angeles, Vancouver, Tijuana',
  'UTC-7 · Denver, Phoenix',
  'UTC-6 · Mexico City, Guatemala, Costa Rica, El Salvador, Honduras',
  'UTC-5 · Bogotá, Lima, Quito, Panama, New York, Miami',
  'UTC-4 · Caracas, La Paz, Santo Domingo, Puerto Rico, Santiago',
  'UTC-3 · Buenos Aires, São Paulo, Montevideo',
  'UTC+0 · London, Lisbon',
  'UTC+1 · Madrid, Paris, Berlin, Lagos',
  'UTC+2 · Athens, Cairo, Johannesburg',
  'UTC+3 · Istanbul, Nairobi, Moscow',
  'UTC+4 · Dubai',
  'UTC+5:30 · India',
  'UTC+7 · Bangkok, Jakarta',
  'UTC+8 · Singapore, Hong Kong, Manila',
  'UTC+9 · Tokyo, Seoul',
  'UTC+10 · Sydney',
];

/** The entry for this browser's current offset, to suggest it first. */
export function guessTimeZone(): string | undefined {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  const label = `UTC${minutes === 0 ? '+' : sign}${hours}${rest ? `:${rest}` : ''}`;
  return TIME_ZONES.find((zone) => zone.split(' ')[0] === label);
}

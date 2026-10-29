/**
 * Time zones a specialist picks from, as UTC offsets with the places a startup
 * recognises. Offsets rather than city names: what a startup wants to know is
 * how many hours apart they are. Each entry stays within the 60 characters the
 * API accepts for a time zone.
 */
export const TIME_ZONES: string[] = [
  'UTC-10 · Hawái',
  'UTC-8 · Los Ángeles, Vancouver, Tijuana',
  'UTC-7 · Denver, Phoenix',
  'UTC-6 · Ciudad de México, Centroamérica',
  'UTC-5 · Bogotá, Lima, Quito, Panamá, Nueva York, Miami',
  'UTC-4 · La Paz, Caracas, Santo Domingo, Santiago',
  'UTC-3 · Buenos Aires, São Paulo, Montevideo',
  'UTC+0 · Londres, Lisboa',
  'UTC+1 · Madrid, París, Berlín, Lagos',
  'UTC+2 · Atenas, El Cairo, Johannesburgo',
  'UTC+3 · Estambul, Nairobi, Moscú',
  'UTC+4 · Dubái',
  'UTC+5:30 · India',
  'UTC+7 · Bangkok, Yakarta',
  'UTC+8 · Singapur, Hong Kong, Manila',
  'UTC+9 · Tokio, Seúl',
  'UTC+10 · Sídney',
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

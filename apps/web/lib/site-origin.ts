import { headers } from 'next/headers';

/** Hosts Pocket answers on. Anything else in the Host header is not trusted. */
const KNOWN_HOST = /^(?:[a-z0-9-]+\.)*(?:pocketgrowth\.xyz|vercel\.app)$|^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/i;

const FALLBACK = 'https://app.pocketgrowth.xyz';

/**
 * The origin this request came in on (mainnet, testnet or a preview), so
 * link previews point back to the same site. Server only.
 */
export async function siteOrigin(): Promise<string> {
  const list = await headers();
  const host = (list.get('x-forwarded-host') ?? list.get('host') ?? '').split(',')[0].trim();
  if (!KNOWN_HOST.test(host)) return FALLBACK;
  const local = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host);
  return `${local ? 'http' : 'https'}://${host}`;
}

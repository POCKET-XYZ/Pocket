import { API_URL } from '@/lib/api';

/**
 * Links typed by other users: deliveries, evidence, CVs, websites. The API only
 * takes https ones, but older rows may hold anything, so the browser checks
 * again and a link that is not https is shown as text and never opened.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * An image to show: an https link, or one the Pocket API serves itself (an
 * uploaded logo), which is plain http when running locally.
 */
export function imageSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { origin, protocol } = new URL(url);
    if (protocol === 'https:') return url;
    return origin === new URL(API_URL).origin ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Where a link really goes, shown next to it so nobody opens it blind. */
export function linkHost(url: string | null | undefined): string {
  const href = safeHref(url);
  return href ? new URL(href).hostname.replace(/^www\./, '') : 'unsafe link';
}

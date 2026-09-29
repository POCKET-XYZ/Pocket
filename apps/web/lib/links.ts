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

/** Where a link really goes, shown next to it so nobody opens it blind. */
export function linkHost(url: string | null | undefined): string {
  const href = safeHref(url);
  return href ? new URL(href).hostname.replace(/^www\./, '') : 'unsafe link';
}

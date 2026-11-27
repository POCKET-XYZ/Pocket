import type { JobListing } from '@pocket/shared';
import { API_URL } from './api';
import { CATEGORY_LABELS, usdc } from './format';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A job as a visitor without a session sees it, read on the server for link
 * previews. Null for a draft, an unknown id or an API that does not answer:
 * the preview then falls back to Pocket's own. Never cached, so a draft that
 * was just posted previews right away.
 */
export async function publicJob(id: string): Promise<JobListing | null> {
  if (!UUID.test(id)) return null;
  try {
    const response = await fetch(`${API_URL}/jobs/${id}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as JobListing;
  } catch {
    return null;
  }
}

/** Who posted it, for sentences: the company, or a neutral word. */
export function hirer(job: JobListing): string {
  return job.startup?.companyName ?? 'Una empresa';
}

/** The category as it reads inside a sentence ("un experto en growth"). */
export function categoryInSentence(job: JobListing): string {
  return CATEGORY_LABELS[job.category].toLowerCase();
}

/** The line under the title in a link preview. */
export function previewDescription(job: JobListing): string {
  const opening = `${hirer(job)} busca un experto en ${categoryInSentence(job)}. Presupuesto: ${usdc(job.budget)}.`;
  const scope = job.description.replace(/\s+/g, ' ').trim();
  const room = 200 - opening.length - 1;
  if (room < 40 || !scope) return opening;
  return `${opening} ${scope.length > room ? `${scope.slice(0, room - 1).trimEnd()}…` : scope}`;
}

/** What the startup's own post says before the link. */
export function shareText(job: JobListing): string {
  const who = job.startup ? `En ${job.startup.companyName} buscamos` : 'Buscamos';
  return `${who} un experto en ${categoryInSentence(job)}: ${job.title}. Postúlate en Pocket.`;
}

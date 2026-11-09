import type { MigratedAccount, UserRole } from '@prisma/client';

/**
 * Accounts approved on Pocket's test network and moved to this one, which
 * their owners have not claimed yet (see MigratedAccountsService). Their
 * profiles show in the directories so the marketplace shows who is coming;
 * they cannot be hired or apply until the owner signs in and claims them.
 * Their id is the migrated account's, never a user's.
 */
export type WaitingRow = Pick<MigratedAccount, 'id' | 'role' | 'profile' | 'createdAt'>;

/** A link to a CV or logo stored by a Pocket API, as opposed to an outside link. */
export function pointsToAnUploadedFile(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  try {
    return /\/profiles\/[0-9a-f-]{36}\/(cv|logo)$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * The profile as the directory and the profile page show it. Its uploaded CV
 * or logo pointed at the test network's API: it now points here, where the
 * moved copy is served under the waiting account's id.
 */
export function waitingProfile(
  row: WaitingRow,
  apiBase: string,
): Record<string, unknown> {
  const profile = { ...(row.profile as Record<string, unknown>) };
  for (const field of ['cvUrl', 'logoUrl'] as const) {
    if (pointsToAnUploadedFile(profile[field])) {
      profile[field] =
        `${apiBase}/profiles/${row.id}/${field === 'cvUrl' ? 'cv' : 'logo'}`;
    }
  }
  return { ...profile, id: row.id, userId: row.id, updatedAt: row.createdAt };
}

/** Whether a waiting profile matches the directory's category and search. */
export function matchesWaiting(
  role: UserRole,
  profile: Record<string, unknown>,
  filter: { category?: string; search?: string },
): boolean {
  if (filter.category) {
    const categories: unknown[] = Array.isArray(profile.categories)
      ? profile.categories
      : [];
    if (!categories.includes(filter.category)) return false;
  }
  const search = filter.search?.trim().toLowerCase();
  if (!search) return true;
  const skills: unknown[] = Array.isArray(profile.skills) ? profile.skills : [];
  const fields =
    role === 'specialist'
      ? [profile.headline, profile.bio, ...skills]
      : [profile.companyName, profile.oneLiner, profile.sector];
  return fields.some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(search),
  );
}

/**
 * One page of a directory: its real profiles first, then the waiting ones,
 * as if they were one list.
 */
export function pageWithWaiting<T, W>(
  real: T[],
  realTotal: number,
  waiting: W[],
  offset: number,
  limit: number,
): { items: (T | W)[]; total: number } {
  const room = limit - real.length;
  const start = Math.max(0, offset - realTotal);
  const extra = room > 0 ? waiting.slice(start, start + room) : [];
  return { items: [...real, ...extra], total: realTotal + waiting.length };
}

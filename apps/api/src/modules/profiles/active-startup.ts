import type { Prisma } from '@prisma/client';

/**
 * Jobs of the startup an account acts as right now. An account can own several
 * startups and acts as one at a time: its job list, contracts, dashboard and
 * reports are the active one's.
 */
export function jobsOfActiveStartup(userId: string): Prisma.JobWhereInput {
  return { startupId: userId, startupProfile: { activeFor: { some: { id: userId } } } };
}

/** The company a job shows: its own startup, or the account's active one. */
export const JOB_COMPANY = {
  select: { id: true, companyName: true, logoUrl: true },
} as const;

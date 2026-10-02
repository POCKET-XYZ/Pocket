import type { PrismaClient } from '@prisma/client';
import { StrKey } from '@stellar/stellar-sdk';

type UserWriter = { user: Pick<PrismaClient['user'], 'upsert' | 'findMany' | 'updateMany'> };

export interface SyncResult {
  /** Addresses now managers, in the order listed. */
  managers: string[];
  /** Former managers no longer on the list. */
  demoted: string[];
  /** True when the list was empty and nothing was touched. */
  skipped: boolean;
}

/** The comma-separated list, trimmed, without blanks or repeats. */
export function parseManagerList(raw: string | undefined): string[] {
  const addresses = (raw ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  return [...new Set(addresses)];
}

/**
 * Make the database match the list: every listed address is an approved
 * manager, and every other manager is demoted.
 *
 * A demoted manager keeps their user row, because verifications they reviewed
 * and disputes they resolved point at it. They become a specialist whose
 * verification is rejected: the role guard keeps them out of every manager
 * route (the role is read from the database on each request) and the
 * verification guard out of the marketplace. Their sessions also end at once.
 * Being let back in takes being listed again or a new verification that a
 * manager approves.
 *
 * An empty list touches nothing: a variable missing on one deploy must not
 * lock the whole team out.
 */
export async function syncManagers(
  prisma: UserWriter,
  addresses: string[],
  log: (line: string) => void = console.log,
): Promise<SyncResult> {
  if (addresses.length === 0) {
    log(
      'WARNING: MANAGER_STELLAR_ADDRESSES is empty or unset. No manager was added or demoted.',
    );
    return { managers: [], demoted: [], skipped: true };
  }

  // Check the whole list before writing anything: a typo must not demote the
  // others and stop halfway.
  const invalid = addresses.filter((address) => !StrKey.isValidEd25519PublicKey(address));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid Stellar address in MANAGER_STELLAR_ADDRESSES: ${invalid.join(', ')}`,
    );
  }

  // Add first, demote after: at no point does the team have fewer managers
  // than the list asks for.
  for (const stellarAddress of addresses) {
    await prisma.user.upsert({
      where: { stellarAddress },
      create: { stellarAddress, role: 'manager', verificationStatus: 'approved' },
      update: { role: 'manager', verificationStatus: 'approved' },
    });
    log(`Manager ready: ${stellarAddress}`);
  }

  const former = await prisma.user.findMany({
    where: { role: 'manager', stellarAddress: { notIn: addresses } },
    select: { stellarAddress: true },
  });
  const demoted = former.map((user) => user.stellarAddress);
  if (demoted.length > 0) {
    await prisma.user.updateMany({
      where: { role: 'manager', stellarAddress: { in: demoted } },
      data: {
        role: 'specialist',
        verificationStatus: 'rejected',
        tokenVersion: { increment: 1 },
      },
    });
    for (const address of demoted) log(`Manager demoted, not on the list: ${address}`);
  }
  return { managers: addresses, demoted, skipped: false };
}

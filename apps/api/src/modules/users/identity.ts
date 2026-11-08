import type { Prisma, VerificationStatus } from '@prisma/client';

/**
 * Statuses of a specialist the marketplace shows and lets apply: their account
 * details are in. The identity check comes when they accept a contract.
 */
export const ACTIVE_SPECIALIST: VerificationStatus[] = ['approved', 'pending'];

/** Selects what `identityVerified` reads off a user: their passed identity checks. */
export const IDENTITY_SELECT = {
  verificationStatus: true,
  _count: {
    select: {
      verificationRequests: { where: { status: 'approved', kycStatus: 'Approved' } },
    },
  },
} satisfies Prisma.UserSelect;

/**
 * Whether the account passed Pocket's identity check through Didit. An account
 * approved where Didit is not set up completed its details only, so it does
 * not count.
 */
export function identityVerified(user: {
  verificationStatus: VerificationStatus;
  _count: { verificationRequests: number };
}): boolean {
  return user.verificationStatus === 'approved' && user._count.verificationRequests > 0;
}

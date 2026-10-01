import type { User } from '@pocket/shared';

/** Where a user lands after signing in, and their way back from a page not for them. */
export function homeFor(user: User): string {
  if (user.role === 'manager') return '/manager/verifications';
  if (user.verificationStatus !== 'approved') return '/verification';
  return user.role === 'startup' ? '/dashboard' : '/jobs';
}

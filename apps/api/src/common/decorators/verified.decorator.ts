import { SetMetadata } from '@nestjs/common';

export const VERIFIED_KEY = 'requiresVerifiedUser';

/** How far along an account must be: identity checked, or just active. */
export type VerifiedLevel = 'approved' | 'active';

/**
 * Restrict a route to approved users: their identity was checked through
 * Didit, or they completed their account details where Didit is not set up.
 * The status changes after a token is issued, so the guard reads it from the
 * database.
 */
export const Verified = () =>
  SetMetadata(VERIFIED_KEY, 'approved' satisfies VerifiedLevel);

/**
 * Restrict a route to active accounts (see `isAccountActive`): for a
 * specialist, sending the account details is enough, so they can build a
 * profile and apply before the identity check that accepting a contract needs.
 * For a startup it is the same as `Verified`.
 */
export const ActiveAccount = () =>
  SetMetadata(VERIFIED_KEY, 'active' satisfies VerifiedLevel);

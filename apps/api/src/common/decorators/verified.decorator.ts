import { SetMetadata } from '@nestjs/common';

export const VERIFIED_KEY = 'requiresVerifiedUser';

/**
 * Restrict a route to approved users, those who completed their account
 * details. The status changes after a token is issued, so the guard reads it
 * from the database.
 */
export const Verified = () => SetMetadata(VERIFIED_KEY, true);

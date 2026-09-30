import type { UserRole } from '@prisma/client';

/** Claims carried by Pocket access tokens. */
export interface JwtPayload {
  sub: string;
  role: UserRole;
  stellarAddress: string;
  /**
   * The user's session version when the token was issued. Signing out bumps
   * it in the database, which ends every token issued before.
   */
  ver: number;
}

/**
 * The authenticated user attached to each request by the JWT guard. Its role
 * comes from the database, never from the token.
 */
export interface AuthUser {
  sub: string;
  role: UserRole;
  stellarAddress: string;
}

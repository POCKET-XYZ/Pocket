import type { UserRole } from '@prisma/client';

/** The two roles one account can combine. A manager is only ever a manager. */
export const MARKET_ROLES = ['startup', 'specialist'] as const;
export type MarketRole = (typeof MARKET_ROLES)[number];

/**
 * Every role an account has. Accounts from before roles could be combined
 * have only their `role`.
 */
export function rolesOf(user: { role: UserRole; roles: UserRole[] }): UserRole[] {
  return user.roles.length > 0 ? user.roles : [user.role];
}

/** The account's roles with one more, the marketplace ones only, each once. */
export function withRole(
  user: { role: UserRole; roles: UserRole[] },
  role: MarketRole,
): MarketRole[] {
  const current = rolesOf(user).filter((r): r is MarketRole =>
    (MARKET_ROLES as readonly string[]).includes(r),
  );
  return current.includes(role) ? current : [...current, role];
}

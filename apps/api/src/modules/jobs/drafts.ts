import type { AuthUser } from '../../common/types/auth';

/**
 * Who may see a draft: the startup that saved it, and managers. For anyone
 * else a draft does not exist.
 */
export function canSeeDraft(user: AuthUser | undefined, startupId: string): boolean {
  return Boolean(user && (user.sub === startupId || user.role === 'manager'));
}

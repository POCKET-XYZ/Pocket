import type { ChatChannel } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';

/** Who someone is on a contract, as far as its chats go. */
export type ChatParty = 'startup' | 'specialist' | 'manager';

/** Messages are grouped into one email per chat at most this often. */
export const EMAIL_EVERY_MS = 15 * 60_000;

export function partyOf(
  user: Pick<AuthUser, 'sub' | 'role'>,
  contract: { startupId: string; specialistId: string },
): ChatParty | null {
  if (user.sub === contract.startupId) return 'startup';
  if (user.sub === contract.specialistId) return 'specialist';
  if (user.role === 'manager') return 'manager';
  return null;
}

/**
 * The chats a party sees on a contract. The startup and the specialist share
 * the contract chat from the offer on. Once the contract has a dispute,
 * managers join it, and each side also gets a private chat with them.
 * Managers see nothing of a contract without a dispute.
 */
export function channelsFor(party: ChatParty, hasDispute: boolean): ChatChannel[] {
  if (party === 'manager') {
    return hasDispute ? ['contract', 'manager_startup', 'manager_specialist'] : [];
  }
  if (!hasDispute) return ['contract'];
  return ['contract', party === 'startup' ? 'manager_startup' : 'manager_specialist'];
}

/**
 * The users a message in a chat is for, besides managers, who are not
 * emailed: the startup, the specialist, or one of them in a private chat.
 */
export function recipientsOf(
  channel: ChatChannel,
  contract: { startupId: string; specialistId: string },
): string[] {
  if (channel === 'manager_startup') return [contract.startupId];
  if (channel === 'manager_specialist') return [contract.specialistId];
  return [contract.startupId, contract.specialistId];
}

import type { PayoutRecipient } from '@prisma/client';
import type { UsdcTransfer } from '../stellar/payment-history';

/** The addresses a payout out of a contract's escrow can go to. */
export interface PayoutParties {
  specialist: string;
  startup: string;
  /** The platform address, which receives Pocket's fee. */
  pocket: string;
  /**
   * Trustless Work's fee address when this network's calls name it (testnet).
   * Unset on mainnet, where the escrow has it written in.
   */
  trustlessWork?: string;
}

/**
 * Who each transfer out of the escrow went to. Pocket's policies only sign a
 * release or a resolution that pays the parties, Pocket and Trustless Work, so
 * without a known fee address the one left is Trustless Work's fee; with one,
 * anyone else is shown as `other` rather than hidden.
 */
export function classifyPayouts(
  transfers: readonly UsdcTransfer[],
  parties: PayoutParties,
): { recipient: PayoutRecipient; address: string; amount: string }[] {
  return transfers.map(({ to, amount }) => ({
    recipient: recipientOf(to, parties),
    address: to,
    amount,
  }));
}

function recipientOf(address: string, parties: PayoutParties): PayoutRecipient {
  if (address === parties.specialist) return 'specialist';
  if (address === parties.startup) return 'startup';
  if (address === parties.pocket) return 'pocket';
  if (!parties.trustlessWork || address === parties.trustlessWork)
    return 'trustless_work';
  return 'other';
}

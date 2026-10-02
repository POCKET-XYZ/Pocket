import { StrKey } from '@stellar/stellar-sdk';
import { fromUnits, toUnits } from './usdc';

/** The longest text memo Stellar takes, in bytes (not characters). */
export const MAX_MEMO_BYTES = 28;

/** The largest whole part the API accepts, in digits. */
const MAX_WHOLE_DIGITS = 12;

/** What the user typed in the send form. */
export interface SendDraft {
  destination: string;
  amount: string;
  memo: string;
}

/** What is wrong with each field, in words. Empty when the draft can be sent. */
export type SendProblems = Partial<Record<keyof SendDraft, string>>;

/** How many bytes a memo takes on the network. */
export function memoBytes(memo: string): number {
  return new TextEncoder().encode(memo).length;
}

export function destinationProblem(value: string, ownAddress: string): string | null {
  const address = value.trim();
  if (!address) return 'Enter the Stellar address to send to.';
  if (StrKey.isValidEd25519SecretSeed(address)) {
    return 'This is a secret key, not an address. Never share it. Enter the address that starts with G.';
  }
  if (address.startsWith('M')) {
    return 'Addresses that start with M are not supported. Use the G address and put any ID in the memo.';
  }
  if (!address.startsWith('G')) return 'A Stellar address starts with G.';
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return 'This is not a valid Stellar address. Check it character by character.';
  }
  if (address === ownAddress) return 'This is your own address.';
  return null;
}

/** `spendable` is the USDC the wallet can send, or null when it holds none. */
export function amountProblem(value: string, spendable: string | null): string | null {
  const amount = value.trim();
  if (!amount) return 'Enter an amount.';
  if (!/^\d*\.?\d*$/.test(amount) || amount === '.') return 'Enter a number, like 25.50.';
  const [whole = '', fraction = ''] = amount.split('.');
  if (fraction.length > 7) return 'USDC has at most 7 decimals.';
  if (whole.replace(/^0+/, '').length > MAX_WHOLE_DIGITS)
    return 'This amount is too large.';
  const units = toUnits(amount);
  if (units <= BigInt(0)) return 'Enter an amount more than zero.';
  if (spendable === null) return 'Your wallet does not hold USDC yet.';
  if (units > toUnits(spendable)) {
    return `You can send at most ${fromUnits(toUnits(spendable))} USDC.`;
  }
  return null;
}

export function memoProblem(value: string): string | null {
  const bytes = memoBytes(value.trim());
  if (bytes > MAX_MEMO_BYTES) {
    return `The memo can be at most ${MAX_MEMO_BYTES} bytes. This one is ${bytes}.`;
  }
  return null;
}

/** Every problem of the draft, by field. */
export function sendProblems(
  draft: SendDraft,
  ownAddress: string,
  spendable: string | null,
): SendProblems {
  const problems: SendProblems = {};
  const destination = destinationProblem(draft.destination, ownAddress);
  const amount = amountProblem(draft.amount, spendable);
  const memo = memoProblem(draft.memo);
  if (destination) problems.destination = destination;
  if (amount) problems.amount = amount;
  if (memo) problems.memo = memo;
  return problems;
}

/**
 * The draft as it is sent and confirmed: trimmed, and the amount written the
 * way the chain counts it (".5" becomes "0.5", "5.00" becomes "5"). Call it
 * only on a draft without problems.
 */
export function normalizeDraft(draft: SendDraft): SendDraft {
  return {
    destination: draft.destination.trim(),
    amount: fromUnits(toUnits(draft.amount.trim())),
    memo: draft.memo.trim(),
  };
}

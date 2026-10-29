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
  if (!address) return 'Escribe la dirección de Stellar a la que quieres enviar.';
  if (StrKey.isValidEd25519SecretSeed(address)) {
    return 'Esto es una clave secreta, no una dirección. Nunca la compartas. Escribe la dirección que empieza con G.';
  }
  if (address.startsWith('M')) {
    return 'No se admiten direcciones que empiezan con M. Usa la dirección G y pon cualquier ID en el memo.';
  }
  if (!address.startsWith('G')) return 'Una dirección de Stellar empieza con G.';
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return 'Esta no es una dirección de Stellar válida. Revísala carácter por carácter.';
  }
  if (address === ownAddress) return 'Esta es tu propia dirección.';
  return null;
}

/** `spendable` is the USDC the wallet can send, or null when it holds none. */
export function amountProblem(value: string, spendable: string | null): string | null {
  const amount = value.trim();
  if (!amount) return 'Escribe un monto.';
  if (!/^\d*\.?\d*$/.test(amount) || amount === '.')
    return 'Escribe un número, como 25.50.';
  const [whole = '', fraction = ''] = amount.split('.');
  if (fraction.length > 7) return 'USDC admite como máximo 7 decimales.';
  if (whole.replace(/^0+/, '').length > MAX_WHOLE_DIGITS)
    return 'Este monto es demasiado grande.';
  const units = toUnits(amount);
  if (units <= BigInt(0)) return 'Escribe un monto mayor que cero.';
  if (spendable === null) return 'Tu wallet todavía no tiene USDC.';
  if (units > toUnits(spendable)) {
    return `Puedes enviar como máximo ${fromUnits(toUnits(spendable))} USDC.`;
  }
  return null;
}

export function memoProblem(value: string): string | null {
  const bytes = memoBytes(value.trim());
  if (bytes > MAX_MEMO_BYTES) {
    return `El memo puede tener como máximo ${MAX_MEMO_BYTES} bytes. Este tiene ${bytes}.`;
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

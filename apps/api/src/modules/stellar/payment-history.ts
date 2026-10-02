import type { UsdcPaymentRecord } from '@pocket/shared';

export type { UsdcPaymentRecord };

/** The fields of a Horizon payment record this reads. Everything else is ignored. */
interface PaymentLike {
  id: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful?: boolean;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  source_amount?: string;
  source_asset_type?: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  asset_balance_changes?: {
    type: string;
    from?: string;
    to?: string;
    amount: string;
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }[];
}

/**
 * The USDC movements of `address` among Horizon payment records, newest first
 * as they come. Plain payments, path payments that end or start in USDC, and
 * contract transfers (an escrow funded or released). Anything that is not
 * this USDC, failed, or does not involve the address is left out.
 */
export function usdcPaymentsOf(
  records: readonly unknown[],
  address: string,
  code: string,
  issuer: string,
): UsdcPaymentRecord[] {
  const isUsdc = (assetCode?: string, assetIssuer?: string) =>
    assetCode === code && assetIssuer === issuer;
  const result: UsdcPaymentRecord[] = [];

  for (const raw of records as PaymentLike[]) {
    if (raw.transaction_successful === false) continue;
    const base = { txHash: raw.transaction_hash, createdAt: raw.created_at };

    if (raw.type === 'invoke_host_function') {
      (raw.asset_balance_changes ?? []).forEach((change, index) => {
        if (
          change.type !== 'transfer' ||
          !isUsdc(change.asset_code, change.asset_issuer)
        ) {
          return;
        }
        const movement = directionOf(change.from, change.to, address);
        if (!movement) return;
        result.push({
          id: `${raw.id}-${index}`,
          ...base,
          ...movement,
          amount: change.amount,
        });
      });
      continue;
    }

    if (
      raw.type !== 'payment' &&
      raw.type !== 'path_payment_strict_receive' &&
      raw.type !== 'path_payment_strict_send'
    ) {
      continue;
    }
    const movement = directionOf(raw.from, raw.to, address);
    if (!movement) continue;
    // A path payment sends one asset and delivers another: what counts is the
    // side of it this account is on.
    const amount =
      movement.direction === 'in' || raw.type === 'payment'
        ? isUsdc(raw.asset_code, raw.asset_issuer) && raw.amount
        : isUsdc(raw.source_asset_code, raw.source_asset_issuer) && raw.source_amount;
    if (!amount) continue;
    result.push({ id: raw.id, ...base, ...movement, amount });
  }
  return result;
}

/** Which way money moved for `address`, or null when it is not in it (or both ends). */
function directionOf(
  from: string | undefined,
  to: string | undefined,
  address: string,
): Pick<UsdcPaymentRecord, 'direction' | 'counterparty'> | null {
  if (!from || !to || from === to) return null;
  if (to === address) return { direction: 'in', counterparty: from };
  if (from === address) return { direction: 'out', counterparty: to };
  return null;
}

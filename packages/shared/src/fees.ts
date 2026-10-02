/**
 * Trustless Work keeps a fixed 0.3% of every amount its escrow pays out: each
 * released milestone and each side of a resolved dispute. Deploying, funding,
 * approving and disputing pay no fee. Pocket's own fee is 0% during the MVP.
 */
export const TRUSTLESS_WORK_FEE_PERCENT = 0.3;

/** Pocket's own fee, as a percent of every amount released to a specialist. */
export const POCKET_FEE_PERCENT = 1;

/** 0.3% expressed as a fraction of 1000, so the math stays in integers. */
const FEE_PER_THOUSAND = 3n;
/** USDC on Stellar has 7 decimals. */
const UNITS_PER_USDC = 10_000_000n;

/**
 * What a payout leaves after Trustless Work's fee, as a decimal string.
 * Each payout is charged on its own, so pass one milestone at a time and add
 * the results.
 */
export function afterTrustlessWorkFee(amount: string | number): string {
  const units = toUnits(String(amount));
  const fee = (units * FEE_PER_THOUSAND) / 1000n;
  return fromUnits(units - fee);
}

/** Sum of each payout after the fee: what the specialist receives in total. */
export function totalAfterTrustlessWorkFee(amounts: (string | number)[]): string {
  const total = amounts.reduce<bigint>(
    (sum, amount) => sum + toUnits(afterTrustlessWorkFee(amount)),
    0n,
  );
  return fromUnits(total);
}

function toUnits(amount: string): bigint {
  const [whole = '0', fraction = ''] = amount.trim().split('.');
  if (!/^\d+$/.test(whole || '0') || !/^\d*$/.test(fraction)) {
    throw new Error(`Not a USDC amount: ${amount}`);
  }
  return (
    BigInt(whole || '0') * UNITS_PER_USDC + BigInt(fraction.padEnd(7, '0').slice(0, 7))
  );
}

function fromUnits(units: bigint): string {
  const whole = units / UNITS_PER_USDC;
  const fraction = (units % UNITS_PER_USDC)
    .toString()
    .padStart(7, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

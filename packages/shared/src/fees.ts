/**
 * Two fees come out of every amount an escrow pays out: each released
 * milestone and each side of a resolved dispute. Deploying, funding, approving
 * and disputing pay neither, only the network's.
 *
 * Trustless Work keeps a fixed 0.3% as its protocol fee. Pocket keeps 1% as
 * its platform fee, which the escrow sends to Pocket's platform account.
 */
export const TRUSTLESS_WORK_FEE_PERCENT = 0.3;

/** Pocket's own fee, as a percent of each payout. */
export const POCKET_FEE_PERCENT = 1;

/**
 * Pocket's fee in basis points (hundredths of a percent): 1% is 100. This is
 * the value the escrow stores as its `platform_fee`, and what the API checks
 * on chain before and after every deploy.
 */
export const POCKET_FEE_BASIS_POINTS = Math.round(POCKET_FEE_PERCENT * 100);

/** Trustless Work's 0.3% in basis points. */
const TRUSTLESS_WORK_FEE_BASIS_POINTS = 30n;
const BASIS_POINTS = 10_000n;
/** USDC on Stellar has 7 decimals. */
const UNITS_PER_USDC = 10_000_000n;

/**
 * What a payout leaves after both fees, as a decimal string. The escrow
 * computes each fee on the full payout and rounds it down to the stroop, so
 * this does the same, fee by fee. Each payout is charged on its own, so pass
 * one milestone at a time and add the results.
 */
export function afterFees(amount: string | number): string {
  const units = toUnits(String(amount));
  const trustlessWork = (units * TRUSTLESS_WORK_FEE_BASIS_POINTS) / BASIS_POINTS;
  const pocket = (units * BigInt(POCKET_FEE_BASIS_POINTS)) / BASIS_POINTS;
  return fromUnits(units - trustlessWork - pocket);
}

/** Sum of each payout after both fees: what the specialist receives in total. */
export function totalAfterFees(amounts: (string | number)[]): string {
  const total = amounts.reduce<bigint>(
    (sum, amount) => sum + toUnits(afterFees(amount)),
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

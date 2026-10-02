import {
  afterFees,
  POCKET_FEE_BASIS_POINTS,
  POCKET_FEE_PERCENT,
  totalAfterFees,
} from '@pocket/shared';

/**
 * The amounts the screens promise the specialist, from @pocket/shared. The
 * escrow takes Trustless Work's 0.3% and Pocket's 1% from each payout, each
 * computed on the full payout and rounded down to the stroop.
 */
describe('what a payout leaves after both fees', () => {
  it('is 1% in basis points on chain', () => {
    expect(POCKET_FEE_PERCENT).toBe(1);
    expect(POCKET_FEE_BASIS_POINTS).toBe(100);
  });

  it.each([
    ['1', '0.987'],
    ['1.5', '1.4805'],
    ['0.5', '0.4935'],
    ['450.5', '444.6435'],
    [1000, '987'],
    // 1000 stroops: 3 to Trustless Work, 10 to Pocket.
    ['0.0001', '0.0000987'],
    // Each fee rounds down to nothing on the smallest amounts.
    ['0.0000001', '0.0000001'],
    ['0.0000099', '0.0000099'],
    ['0.00001', '0.0000099'],
  ])('%s USDC leaves %s', (amount, expected) => {
    expect(afterFees(amount)).toBe(expected);
  });

  it('charges each payout on its own', () => {
    // 50 stroops pay no fee on their own; 100 in one payout pay Pocket one.
    expect(totalAfterFees(['0.000005', '0.000005'])).toBe('0.00001');
    expect(afterFees('0.00001')).toBe('0.0000099');
    expect(totalAfterFees(['450.5', '49.5'])).toBe('493.5');
  });

  it('refuses what is not an amount', () => {
    expect(() => afterFees('-1')).toThrow('Not a USDC amount');
  });
});

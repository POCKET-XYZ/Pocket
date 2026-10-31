import { usdcPaymentsOf, usdcTransfersOf } from './payment-history';

const ME = 'GME';
const OTHER = 'GOTHER';
const ISSUER = 'GISSUER';
const ESCROW = 'CESCROW';

const record = (fields: Record<string, unknown>) => ({
  id: '1',
  created_at: '2026-10-01T10:00:00Z',
  transaction_hash: 'hash-1',
  transaction_successful: true,
  ...fields,
});

const usdc = { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ISSUER };

describe('usdcPaymentsOf', () => {
  it('reads USDC payments in and out, with who was on the other side', () => {
    const payments = usdcPaymentsOf(
      [
        record({
          id: '2',
          type: 'payment',
          from: OTHER,
          to: ME,
          amount: '5.0000000',
          ...usdc,
        }),
        record({
          id: '1',
          type: 'payment',
          from: ME,
          to: OTHER,
          amount: '1.5000000',
          ...usdc,
        }),
      ],
      ME,
      'USDC',
      ISSUER,
    );
    expect(payments).toEqual([
      {
        id: '2',
        txHash: 'hash-1',
        createdAt: '2026-10-01T10:00:00Z',
        direction: 'in',
        counterparty: OTHER,
        amount: '5.0000000',
      },
      {
        id: '1',
        txHash: 'hash-1',
        createdAt: '2026-10-01T10:00:00Z',
        direction: 'out',
        counterparty: OTHER,
        amount: '1.5000000',
      },
    ]);
  });

  it('leaves out other assets, a fake USDC, XLM, failures and other operations', () => {
    const payments = usdcPaymentsOf(
      [
        record({
          type: 'payment',
          from: OTHER,
          to: ME,
          amount: '1',
          asset_type: 'native',
        }),
        record({
          type: 'payment',
          from: OTHER,
          to: ME,
          amount: '1',
          ...usdc,
          asset_issuer: 'GFAKE',
        }),
        record({
          type: 'payment',
          from: OTHER,
          to: ME,
          amount: '1',
          ...usdc,
          transaction_successful: false,
        }),
        record({
          type: 'create_account',
          funder: OTHER,
          account: ME,
          starting_balance: '1',
        }),
        record({ type: 'payment', from: ME, to: ME, amount: '1', ...usdc }),
      ],
      ME,
      'USDC',
      ISSUER,
    );
    expect(payments).toEqual([]);
  });

  it('counts the side of a path payment this account is on', () => {
    const payments = usdcPaymentsOf(
      [
        // Paid in XLM, delivered as USDC to me.
        record({
          id: 'in',
          type: 'path_payment_strict_receive',
          from: OTHER,
          to: ME,
          amount: '10',
          ...usdc,
          source_amount: '80',
          source_asset_type: 'native',
        }),
        // Paid by me in USDC, delivered as XLM.
        record({
          id: 'out',
          type: 'path_payment_strict_send',
          from: ME,
          to: OTHER,
          amount: '80',
          asset_type: 'native',
          source_amount: '10',
          source_asset_type: 'credit_alphanum4',
          source_asset_code: 'USDC',
          source_asset_issuer: ISSUER,
        }),
      ],
      ME,
      'USDC',
      ISSUER,
    );
    expect(payments.map((p) => [p.id, p.direction, p.amount])).toEqual([
      ['in', 'in', '10'],
      ['out', 'out', '10'],
    ]);
  });

  it('reads escrow transfers from contract calls', () => {
    const payments = usdcPaymentsOf(
      [
        record({
          id: '9',
          type: 'invoke_host_function',
          asset_balance_changes: [
            { type: 'transfer', from: ESCROW, to: ME, amount: '200.0000000', ...usdc },
            { type: 'transfer', from: ESCROW, to: OTHER, amount: '1.0000000', ...usdc },
            { type: 'mint', from: ISSUER, to: ME, amount: '3.0000000', ...usdc },
          ],
        }),
      ],
      ME,
      'USDC',
      ISSUER,
    );
    expect(payments).toEqual([
      expect.objectContaining({
        id: '9-0',
        direction: 'in',
        counterparty: ESCROW,
        amount: '200.0000000',
      }),
    ]);
  });
});

describe('usdcTransfersOf', () => {
  const transfer = (fields: Record<string, unknown>) => ({
    type: 'transfer',
    from: ESCROW,
    to: ME,
    amount: '1.0000000',
    ...usdc,
    ...fields,
  });

  it('reads what a release paid out of the escrow, to whom', () => {
    const transfers = usdcTransfersOf(
      [
        record({
          type: 'invoke_host_function',
          asset_balance_changes: [
            transfer({ to: 'GTW', amount: '0.0900000' }),
            transfer({ to: 'GPOCKET', amount: '0.3000000' }),
            transfer({ to: 'GSPECIALIST', amount: '29.6100000' }),
          ],
        }),
      ],
      ESCROW,
      'USDC',
      ISSUER,
    );
    expect(transfers).toEqual([
      { to: 'GTW', amount: '0.0900000' },
      { to: 'GPOCKET', amount: '0.3000000' },
      { to: 'GSPECIALIST', amount: '29.6100000' },
    ]);
  });

  it('leaves out other assets, other senders, mints and failed transactions', () => {
    const transfers = usdcTransfersOf(
      [
        record({
          type: 'invoke_host_function',
          asset_balance_changes: [
            transfer({ asset_issuer: 'GFAKE' }),
            transfer({ asset_code: 'EURC' }),
            transfer({ from: OTHER }),
            transfer({ type: 'mint' }),
            transfer({ to: undefined }),
          ],
        }),
        record({
          type: 'invoke_host_function',
          transaction_successful: false,
          asset_balance_changes: [transfer({})],
        }),
        record({ type: 'payment', from: ESCROW, to: ME, amount: '5', ...usdc }),
      ],
      ESCROW,
      'USDC',
      ISSUER,
    );
    expect(transfers).toEqual([]);
  });
});

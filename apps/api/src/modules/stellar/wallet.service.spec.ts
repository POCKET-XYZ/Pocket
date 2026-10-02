import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Keypair } from '@stellar/stellar-sdk';
import type { AuthUser } from '../../common/types/auth';
import type { ChainOperationsService } from './chain-operations.service';
import type { StellarService } from './stellar.service';
import { WalletService } from './wallet.service';

const ME = Keypair.random().publicKey();
const FRIEND = Keypair.random().publicKey();
const USER = { sub: 'user-1', stellarAddress: ME } as AuthUser;

describe('WalletService payments', () => {
  let stellar: {
    spendableUsdc: jest.Mock;
    usdcReadiness: jest.Mock;
    buildUsdcPayment: jest.Mock;
    parse: jest.Mock;
    usdcPayments: jest.Mock;
  };
  let operations: { prepare: jest.Mock; submitSigned: jest.Mock };
  let wallet: WalletService;

  beforeEach(() => {
    stellar = {
      spendableUsdc: jest.fn().mockResolvedValue('100.0000000'),
      usdcReadiness: jest.fn().mockResolvedValue('ready'),
      buildUsdcPayment: jest.fn().mockResolvedValue('unsigned-xdr'),
      parse: jest.fn(),
      usdcPayments: jest.fn().mockResolvedValue([]),
    };
    operations = {
      prepare: jest.fn().mockResolvedValue({
        operationId: 'op-1',
        xdr: 'unsigned-xdr',
        networkPassphrase: 'Test SDF Network ; September 2015',
      }),
      submitSigned: jest.fn().mockResolvedValue({ txHash: 'hash-1', amount: null }),
    };
    wallet = new WalletService(
      stellar as unknown as StellarService,
      operations as unknown as ChainOperationsService,
    );
  });

  const refused = (request: { destination: string; amount: string; memo?: string }) =>
    expect(wallet.preparePayment(USER, request)).rejects.toBeInstanceOf(
      BadRequestException,
    );

  it('builds the payment the user asked for and records it as a payment', async () => {
    const prepared = await wallet.preparePayment(USER, {
      destination: FRIEND,
      amount: '12.5',
      memo: 'invoice 42',
    });

    expect(stellar.usdcReadiness).toHaveBeenCalledWith(FRIEND);
    expect(stellar.buildUsdcPayment).toHaveBeenCalledWith(
      ME,
      FRIEND,
      '12.5000000',
      'invoice 42',
    );
    expect(operations.prepare).toHaveBeenCalledWith(
      { kind: 'payment' },
      'unsigned-xdr',
      'user-1',
      new Prisma.Decimal('12.5'),
    );
    expect(prepared.xdr).toBe('unsigned-xdr');
  });

  it('leaves the memo out when there is none', async () => {
    await wallet.preparePayment(USER, { destination: FRIEND, amount: '1', memo: '' });
    expect(stellar.buildUsdcPayment).toHaveBeenCalledWith(
      ME,
      FRIEND,
      '1.0000000',
      undefined,
    );
  });

  it('accepts the whole spendable balance', async () => {
    await wallet.preparePayment(USER, { destination: FRIEND, amount: '100' });
    expect(operations.prepare).toHaveBeenCalled();
  });

  it.each([
    [
      'an address with a bad checksum',
      `${FRIEND.slice(0, -1)}${FRIEND.endsWith('A') ? 'B' : 'A'}`,
    ],
    ['a secret key', Keypair.random().secret()],
    ['a contract', 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE'],
    ['nothing', ''],
  ])('refuses %s as the destination', async (_label, destination) => {
    await refused({ destination, amount: '1' });
  });

  it('refuses to pay the user their own money', async () => {
    await refused({ destination: ME, amount: '1' });
  });

  it.each([['0'], ['0.0000000'], ['1.12345678'], ['-1'], ['1e3'], ['abc'], ['']])(
    'refuses the amount "%s"',
    async (amount) => {
      await refused({ destination: FRIEND, amount });
    },
  );

  it('refuses more than the wallet can spend', async () => {
    await refused({ destination: FRIEND, amount: '100.0000001' });
    expect(stellar.buildUsdcPayment).not.toHaveBeenCalled();
  });

  it('refuses when the wallet does not hold USDC', async () => {
    stellar.spendableUsdc.mockResolvedValue(null);
    await refused({ destination: FRIEND, amount: '1' });
  });

  it('refuses a memo longer than 28 bytes, counted as bytes', async () => {
    // 14 characters, 28 bytes: fits.
    await wallet.preparePayment(USER, {
      destination: FRIEND,
      amount: '1',
      memo: 'ñ'.repeat(14),
    });
    // 15 characters, 30 bytes: does not.
    await refused({ destination: FRIEND, amount: '1', memo: 'ñ'.repeat(15) });
  });

  it.each([
    ['does not exist', 'no_account', 'does not exist'],
    ['does not trust USDC', 'no_trustline', 'does not accept USDC'],
  ])('refuses a destination that %s', async (_label, readiness, message) => {
    stellar.usdcReadiness.mockResolvedValue(readiness);
    await expect(
      wallet.preparePayment(USER, { destination: FRIEND, amount: '1' }),
    ).rejects.toThrow(message);
    expect(operations.prepare).not.toHaveBeenCalled();
  });

  it('submits only as a payment of this user, and says what was sent', async () => {
    stellar.parse.mockReturnValue({
      operations: [{ type: 'payment', amount: '12.5000000', destination: FRIEND }],
    });
    const result = await wallet.submitPayment(USER, 'signed-xdr');

    expect(operations.submitSigned).toHaveBeenCalledWith(
      { kind: 'payment' },
      'signed-xdr',
      'user-1',
    );
    expect(result).toEqual({
      txHash: 'hash-1',
      amount: '12.5000000',
      destination: FRIEND,
    });
  });

  it('lists the latest 20 payments of the user', async () => {
    await wallet.payments(USER);
    expect(stellar.usdcPayments).toHaveBeenCalledWith(ME, 20);
  });
});

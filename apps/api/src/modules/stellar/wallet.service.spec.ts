import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Keypair } from '@stellar/stellar-sdk';
import type { AuthUser } from '../../common/types/auth';
import * as securityLog from '../../common/security/security-log';
import type { PrismaService } from '../../prisma/prisma.service';
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
    spendableXlm?: jest.Mock;
  };
  let operations: { prepare: jest.Mock; submitSigned: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };
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
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ walletCustody: 'pollar', verificationStatus: 'approved' }),
      },
    };
    wallet = new WalletService(
      stellar as unknown as StellarService,
      operations as unknown as ChainOperationsService,
      prisma as unknown as PrismaService,
    );
  });

  describe('a Pollar wallet short of XLM', () => {
    let alert: jest.SpyInstance;
    beforeEach(() => {
      alert = jest
        .spyOn(securityLog, 'securityEvent')
        .mockImplementation(() => undefined);
      stellar.spendableXlm = jest.fn().mockResolvedValue('0.0000000');
      stellar.usdcReadiness.mockResolvedValue('no_trustline');
    });
    afterEach(() => alert.mockRestore());

    const alerts = (): unknown[][] =>
      (alert.mock.calls as unknown[][]).filter(
        ([name]) => name === 'pollar_wallet_needs_xlm',
      );

    it('tells the team, not the user, once in a while', async () => {
      await wallet.usdcStatus(USER);
      await wallet.usdcStatus(USER);
      expect(alerts()).toHaveLength(1);
      expect(alerts()[0][1]).toMatchObject({ account: ME, usdc: 'no_trustline' });
      expect(alerts()[0][2]).toBe('alert');
    });

    it('says nothing about a wallet the user holds', async () => {
      prisma.user.findUnique.mockResolvedValue({
        walletCustody: 'external',
        verificationStatus: 'approved',
      });
      await wallet.usdcStatus(USER);
      expect(alerts()).toHaveLength(0);
    });

    it('says nothing while the wallet can still enable USDC or pay its fees', async () => {
      stellar.spendableXlm = jest.fn().mockResolvedValue('1.0000000');
      await wallet.usdcStatus(USER);
      stellar.usdcReadiness.mockResolvedValue('ready');
      stellar.spendableXlm = jest.fn().mockResolvedValue('0.5000000');
      await wallet.usdcStatus(USER);
      expect(alerts()).toHaveLength(0);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
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
    ['does not exist', 'no_account', 'todavía no existe'],
    ['does not trust USDC', 'no_trustline', 'todavía no acepta USDC'],
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

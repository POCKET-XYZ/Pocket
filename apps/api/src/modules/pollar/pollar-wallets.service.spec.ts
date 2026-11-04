import type { PrismaService } from '../../prisma/prisma.service';
import type { PollarClient } from './pollar.client';
import { PollarWalletsService } from './pollar-wallets.service';

describe('PollarWalletsService', () => {
  const USER = {
    id: 'user-1',
    stellarAddress: 'GPOLLARWALLET',
    walletCustody: 'pollar',
    walletFundedAt: null,
  };
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let pollar: { enabled: boolean; fundWallet: jest.Mock };
  let service: PollarWalletsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(USER), update: jest.fn() },
    };
    pollar = {
      enabled: true,
      fundWallet: jest
        .fn()
        .mockResolvedValue({ alreadyFunded: false, startingBalance: '0' }),
    };
    service = new PollarWalletsService(
      prisma as unknown as PrismaService,
      pollar as unknown as PollarClient,
    );
  });

  it('funds an unfunded Pollar wallet and records it', async () => {
    await expect(service.activate('user-1')).resolves.toBe(true);
    expect(pollar.fundWallet).toHaveBeenCalledWith('GPOLLARWALLET');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { walletFundedAt: expect.any(Date) as Date },
    });
  });

  it('asks Pollar once when two sign-ins activate the same wallet at once', async () => {
    const [first, second] = await Promise.all([
      service.activate('user-1'),
      service.activate('user-1'),
    ]);
    expect([first, second]).toEqual([true, true]);
    expect(pollar.fundWallet).toHaveBeenCalledTimes(1);
  });

  it('can try again once an activation ended', async () => {
    pollar.fundWallet.mockRejectedValueOnce(new Error('Pollar is down'));
    await expect(service.activate('user-1')).resolves.toBe(false);
    await expect(service.activate('user-1')).resolves.toBe(true);
    expect(pollar.fundWallet).toHaveBeenCalledTimes(2);
  });

  it('leaves alone a wallet the user holds, or one funded already', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ ...USER, walletCustody: 'external' });
    await expect(service.activate('user-1')).resolves.toBe(false);
    prisma.user.findUnique.mockResolvedValueOnce({ ...USER, walletFundedAt: new Date() });
    await expect(service.activate('user-1')).resolves.toBe(false);
    expect(pollar.fundWallet).not.toHaveBeenCalled();
  });
});

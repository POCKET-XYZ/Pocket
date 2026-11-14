import * as securityLog from '../../common/security/security-log';
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
  let prisma: {
    user: { findUnique: jest.Mock; updateMany: jest.Mock; findMany: jest.Mock };
  };
  let pollar: { enabled: boolean; fundWallet: jest.Mock };
  let service: PollarWalletsService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(USER),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
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
    service.retryDelaysMs = [0, 0];
  });

  it('funds an unfunded Pollar wallet and records it', async () => {
    await expect(service.activate('user-1')).resolves.toBe(true);
    expect(pollar.fundWallet).toHaveBeenCalledWith('GPOLLARWALLET');
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { stellarAddress: 'GPOLLARWALLET', walletCustody: 'pollar', walletFundedAt: null },
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

  it('tries again at once when Pollar fails, as it did with a 504', async () => {
    pollar.fundWallet
      .mockRejectedValueOnce(new Error('Pollar could not fund the wallet: 504'))
      .mockRejectedValueOnce(new Error('Pollar could not fund the wallet: 504'));
    await expect(service.activate('user-1')).resolves.toBe(true);
    expect(pollar.fundWallet).toHaveBeenCalledTimes(3);
  });

  it('tells the team at once when Pollar says the funding wallet is short, and stops retrying', async () => {
    const alerts = jest.spyOn(securityLog, 'securityEvent').mockImplementation(() => undefined);
    pollar.fundWallet.mockRejectedValue(new Error('Pollar could not fund the wallet: TX_LOW_RESERVE'));
    await expect(service.activate('user-1')).resolves.toBe(false);
    await service.activate('user-1');
    expect(pollar.fundWallet).toHaveBeenCalledTimes(2);
    expect(alerts).toHaveBeenCalledTimes(1);
    expect(alerts).toHaveBeenCalledWith(
      'funding_wallet_low',
      expect.objectContaining({ waitingWallet: 'GPOLLARWALLET' }),
      'alert',
    );
    alerts.mockRestore();
  });

  it('gives up after three attempts, and a later one starts over', async () => {
    pollar.fundWallet.mockRejectedValue(new Error('Pollar is down'));
    await expect(service.activate('user-1')).resolves.toBe(false);
    expect(pollar.fundWallet).toHaveBeenCalledTimes(3);
    pollar.fundWallet.mockResolvedValue({ alreadyFunded: false, startingBalance: '1' });
    await expect(service.activate('user-1')).resolves.toBe(true);
  });

  it('activates a wallet before its Pocket account exists, by its address', async () => {
    await expect(service.activateAddress('GNEWPOLLAR')).resolves.toBe(true);
    expect(pollar.fundWallet).toHaveBeenCalledWith('GNEWPOLLAR');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('counts a wallet Pollar already funded as active', async () => {
    pollar.fundWallet.mockResolvedValue({ alreadyFunded: true });
    await expect(service.activate('user-1')).resolves.toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });

  it('sweeps the Pollar wallets still waiting, whether or not their owner comes back', async () => {
    prisma.user.findMany.mockResolvedValue([
      { stellarAddress: 'GWAITING1' },
      { stellarAddress: 'GWAITING2' },
    ]);
    pollar.fundWallet
      .mockResolvedValueOnce({ alreadyFunded: false, startingBalance: '1' })
      .mockRejectedValue(new Error('Pollar is down'));
    await expect(service.sweep()).resolves.toBe(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { walletCustody: 'pollar', walletFundedAt: null, deletedAt: null },
      }),
    );
  });

  it('leaves alone a wallet the user holds, or one funded already', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ ...USER, walletCustody: 'external' });
    await expect(service.activate('user-1')).resolves.toBe(false);
    prisma.user.findUnique.mockResolvedValueOnce({ ...USER, walletFundedAt: new Date() });
    await expect(service.activate('user-1')).resolves.toBe(false);
    expect(pollar.fundWallet).not.toHaveBeenCalled();
  });
});

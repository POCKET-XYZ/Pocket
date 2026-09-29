import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PollarWalletsService } from '../pollar/pollar-wallets.service';
import { ManagerService } from './manager.service';

describe('ManagerService', () => {
  let prisma: {
    verificationRequest: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let wallets: { activate: jest.Mock };
  let service: ManagerService;

  beforeEach(() => {
    prisma = {
      verificationRequest: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    // An interactive transaction runs its callback with the client itself.
    prisma.$transaction.mockImplementation((run: (tx: typeof prisma) => unknown) =>
      run(prisma),
    );
    wallets = { activate: jest.fn().mockResolvedValue(true) };
    service = new ManagerService(
      prisma as unknown as PrismaService,
      wallets as unknown as PollarWalletsService,
    );
  });

  it('lists pending requests oldest first by default', async () => {
    await service.list();
    expect(prisma.verificationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'pending' },
        orderBy: { submittedAt: 'asc' },
      }),
    );
  });

  it('approves a pending request and verifies the user', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      userId: 'user-1',
      status: 'pending',
    });
    prisma.verificationRequest.findUniqueOrThrow.mockResolvedValue({
      id: 'req-1',
      userId: 'user-1',
      status: 'approved',
    });

    await service.approve('req-1', 'manager-1', 'Looks good');

    expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'req-1', status: 'pending' },
        data: expect.objectContaining({
          status: 'approved',
          reviewNote: 'Looks good',
          reviewedById: 'manager-1',
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { verificationStatus: 'approved' },
    });
    // The approval is the business event that activates a Pollar wallet.
    expect(wallets.activate).toHaveBeenCalledWith('user-1');
  });

  it('refuses to reject without a reason', async () => {
    await expect(service.reject('req-1', 'manager-1', '  ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.verificationRequest.findUnique).not.toHaveBeenCalled();
  });

  it('rejects with a reason and marks the user rejected', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      userId: 'user-1',
      status: 'pending',
    });
    prisma.verificationRequest.findUniqueOrThrow.mockResolvedValue({
      id: 'req-1',
      status: 'rejected',
    });

    await service.reject('req-1', 'manager-1', 'Company site is offline');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { verificationStatus: 'rejected' },
    });
    // Nothing is paid for an account that was turned down.
    expect(wallets.activate).not.toHaveBeenCalled();
  });

  it('fails when the request does not exist', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue(null);
    await expect(service.approve('missing', 'manager-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not review the same request twice', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      userId: 'user-1',
      status: 'approved',
    });
    await expect(service.approve('req-1', 'manager-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lets only one of two managers deciding at once win', async () => {
    // Both read the request as pending; the other manager claimed it first.
    prisma.verificationRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      userId: 'user-1',
      status: 'pending',
    });
    prisma.verificationRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reject('req-1', 'manager-2', 'Changed my mind')).rejects.toThrow(
      'already reviewed',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(wallets.activate).not.toHaveBeenCalled();
  });
});

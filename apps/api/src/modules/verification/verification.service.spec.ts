import { BadRequestException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PollarWalletsService } from '../pollar/pollar-wallets.service';
import type { SubmitVerificationDto } from './dto/submit-verification.dto';
import { VerificationService } from './verification.service';

const SUBMISSION: SubmitVerificationDto = {
  fullName: 'Ana Rojas',
  contactEmail: 'ana@example.com',
  country: 'CR',
};

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    stellarAddress: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
    role: 'specialist',
    verificationStatus: 'not_submitted',
    walletCustody: 'external',
    walletProvider: null,
    pollarUserId: null,
    email: null,
    walletFundedAt: null,
    tokenVersion: 0,
    termsVersion: null,
    termsAcceptedAt: null,
    termsAcceptedIp: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VerificationService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; updateMany: jest.Mock };
    verificationRequest: { create: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let wallets: { activate: jest.Mock };
  let notifications: { notifyEmail: jest.Mock };
  let service: VerificationService;

  beforeEach(() => {
    wallets = { activate: jest.fn().mockResolvedValue(true) };
    notifications = { notifyEmail: jest.fn() };
    prisma = {
      user: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      verificationRequest: { create: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    // An interactive transaction runs its callback with the client itself.
    prisma.$transaction.mockImplementation((run: (tx: typeof prisma) => unknown) =>
      run(prisma),
    );
    service = new VerificationService(
      prisma as unknown as PrismaService,
      wallets as unknown as PollarWalletsService,
      notifications as unknown as NotificationsService,
    );
  });

  it('approves the account as soon as the details arrive', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.verificationRequest.create.mockReturnValue({
      id: 'req-1',
      contactEmail: SUBMISSION.contactEmail,
    });

    const request = await service.submit('user-1', SUBMISSION);

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', verificationStatus: { not: 'approved' } },
      data: { verificationStatus: 'approved' },
    });
    const { data } = prisma.verificationRequest.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data).toMatchObject({ ...SUBMISSION, userId: 'user-1', status: 'approved' });
    expect(data.reviewedAt).toBe(data.submittedAt);
    expect(data.reviewedById).toBeUndefined();
    expect(request).toMatchObject({ id: 'req-1' });
  });

  it('activates the wallet and tells the user by email', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.verificationRequest.create.mockReturnValue({
      id: 'req-1',
      contactEmail: SUBMISSION.contactEmail,
    });

    await service.submit('user-1', SUBMISSION);

    expect(wallets.activate).toHaveBeenCalledWith('user-1');
    expect(notifications.notifyEmail).toHaveBeenCalledWith(SUBMISSION.contactEmail, {
      type: 'verification_approved',
    });
  });

  it('requires a company name from startups', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'startup' }));
    await expect(service.submit('user-1', SUBMISSION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lets a startup submit with a company name', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'startup' }));
    prisma.verificationRequest.create.mockReturnValue({ id: 'req-2' });
    await expect(
      service.submit('user-1', { ...SUBMISSION, companyName: 'Acme' }),
    ).resolves.toEqual({ id: 'req-2' });
  });

  it('blocks a second submission once approved', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ verificationStatus: 'approved' }));
    await expect(service.submit('user-1', SUBMISSION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.verificationRequest.create).not.toHaveBeenCalled();
    expect(wallets.activate).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'pending'] as const)(
    'approves a user who was %s before',
    async (status) => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ verificationStatus: status }));
      prisma.verificationRequest.create.mockReturnValue({ id: 'req-3' });
      await expect(service.submit('user-1', SUBMISSION)).resolves.toEqual({
        id: 'req-3',
      });
    },
  );

  it('creates one request when the same user submits twice at once', async () => {
    // Both read the user as not submitted; the other submission approved it first.
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.submit('user-1', SUBMISSION)).rejects.toThrow(
      'ya está verificada',
    );
    expect(prisma.verificationRequest.create).not.toHaveBeenCalled();
    expect(wallets.activate).not.toHaveBeenCalled();
  });

  it('never verifies managers', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'manager' }));
    await expect(service.submit('user-1', SUBMISSION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

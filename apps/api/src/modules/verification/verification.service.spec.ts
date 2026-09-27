import { BadRequestException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VerificationService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    verificationRequest: { create: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: VerificationService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      verificationRequest: { create: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    service = new VerificationService(prisma as unknown as PrismaService);
  });

  it('submits a request and moves the user to pending', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.verificationRequest.create.mockReturnValue({ id: 'req-1' });

    const request = await service.submit('user-1', SUBMISSION);

    expect(prisma.verificationRequest.create).toHaveBeenCalledWith({
      data: { ...SUBMISSION, userId: 'user-1', status: 'pending' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { verificationStatus: 'pending' },
    });
    expect(request).toEqual({ id: 'req-1' });
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

  it.each(['pending', 'approved'] as const)(
    'blocks a second submission when %s',
    async (status) => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ verificationStatus: status }));
      await expect(service.submit('user-1', SUBMISSION)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.verificationRequest.create).not.toHaveBeenCalled();
    },
  );

  it('lets a rejected user submit again', async () => {
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ verificationStatus: 'rejected' }),
    );
    prisma.verificationRequest.create.mockReturnValue({ id: 'req-3' });
    await expect(service.submit('user-1', SUBMISSION)).resolves.toEqual({ id: 'req-3' });
  });

  it('never verifies managers', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'manager' }));
    await expect(service.submit('user-1', SUBMISSION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

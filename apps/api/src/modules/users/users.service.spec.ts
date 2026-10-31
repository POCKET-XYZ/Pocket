import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LEGAL_VERSION } from '@pocket/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

const USER = { id: 'user-1', role: 'startup', deletedAt: null };

describe('UsersService', () => {
  let prisma: {
    user: { update: jest.Mock; findUnique: jest.Mock };
    contract: { count: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    application: { update: jest.Mock; updateMany: jest.Mock };
    job: { findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    specialistCv: { deleteMany: jest.Mock };
    specialistProfile: { deleteMany: jest.Mock };
    startupProfile: { deleteMany: jest.Mock };
    verificationRequest: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        update: jest.fn().mockResolvedValue({ id: 'user-1' }),
        findUnique: jest.fn().mockResolvedValue(USER),
      },
      contract: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      application: { update: jest.fn(), updateMany: jest.fn() },
      job: {
        findMany: jest.fn().mockResolvedValue([{ id: 'job-1' }]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      specialistCv: { deleteMany: jest.fn() },
      specialistProfile: { deleteMany: jest.fn() },
      startupProfile: { deleteMany: jest.fn() },
      verificationRequest: { deleteMany: jest.fn() },
      $transaction: jest.fn(),
    };
    // An interactive transaction runs its callback with the client itself.
    prisma.$transaction.mockImplementation((run: (tx: typeof prisma) => unknown) =>
      run(prisma),
    );
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('acceptTerms', () => {
    it('records the version in force, when and from where', async () => {
      await service.acceptTerms('user-1', LEGAL_VERSION, '203.0.113.7');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          termsVersion: LEGAL_VERSION,
          termsAcceptedAt: expect.any(Date),
          termsAcceptedIp: '203.0.113.7',
        },
      });
    });

    it('refuses a version that is not in force', async () => {
      await expect(service.acceptTerms('user-1', '2020-01-01')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('erases the personal data and keeps an anonymous row', async () => {
      await service.deleteAccount('user-1');

      for (const table of [
        prisma.specialistCv,
        prisma.specialistProfile,
        prisma.startupProfile,
        prisma.verificationRequest,
      ]) {
        expect(table.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      }
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          stellarAddress: 'deleted:user-1',
          email: null,
          pollarUserId: null,
          walletProvider: null,
          deletedAt: expect.any(Date),
          tokenVersion: { increment: 1 },
        }),
      });
    });

    it('closes the open jobs of a startup and withdraws pending applications', async () => {
      await service.deleteAccount('user-1');
      expect(prisma.job.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['job-1'] } },
        data: { status: 'closed' },
      });
      expect(prisma.application.updateMany).toHaveBeenCalledWith({
        where: { specialistId: 'user-1', status: 'submitted' },
        data: expect.objectContaining({ status: 'withdrawn' }),
      });
    });

    it('withdraws an offer still waiting, and reopens the job for the startup', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, role: 'specialist' });
      prisma.contract.findMany.mockResolvedValue([
        { id: 'c-1', jobId: 'job-9', applicationId: 'app-1', startupId: 'startup-9' },
      ]);
      await service.deleteAccount('user-1');
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: expect.objectContaining({ status: 'cancelled' }),
      });
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-9' },
        data: { status: 'open' },
      });
    });

    it('is refused while money is in an escrow the user is part of', async () => {
      prisma.contract.count.mockResolvedValueOnce(1);
      await expect(service.deleteAccount('user-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('is refused while an escrow is being deployed for the user', async () => {
      prisma.contract.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      await expect(service.deleteAccount('user-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not close a manager account from the app', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, role: 'manager' });
      await expect(service.deleteAccount('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does nothing twice', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, deletedAt: new Date() });
      await service.deleteAccount('user-1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

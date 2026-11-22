import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LEGAL_VERSION } from '@pocket/shared';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

const USER = { id: 'user-1', role: 'startup', deletedAt: null };

describe('UsersService', () => {
  let prisma: {
    user: { update: jest.Mock; findUnique: jest.Mock };
    contract: { count: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    application: { update: jest.Mock; updateMany: jest.Mock };
    job: {
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    specialistCv: { deleteMany: jest.Mock };
    specialistProfile: { deleteMany: jest.Mock };
    startupProfile: { deleteMany: jest.Mock; count: jest.Mock };
    verificationRequest: { deleteMany: jest.Mock };
    assistantSuggestion: { updateMany: jest.Mock };
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
        deleteMany: jest.fn(),
      },
      specialistCv: { deleteMany: jest.fn() },
      specialistProfile: { deleteMany: jest.fn() },
      startupProfile: { deleteMany: jest.fn(), count: jest.fn().mockResolvedValue(1) },
      verificationRequest: { deleteMany: jest.fn() },
      assistantSuggestion: { updateMany: jest.fn() },
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

    it("clears what they wrote to the assistant, keeping the month's spend", async () => {
      await service.deleteAccount('user-1');
      expect(prisma.assistantSuggestion.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { inputText: null, outputJson: Prisma.DbNull, finalTexts: Prisma.DbNull },
      });
    });

    it('closes the open jobs of a startup and withdraws pending applications', async () => {
      await service.deleteAccount('user-1');
      // Drafts nobody else ever saw are deleted, not closed.
      expect(prisma.job.deleteMany).toHaveBeenCalledWith({
        where: { startupId: 'user-1', status: 'draft' },
      });
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

  describe('roles and startups', () => {
    const both = { ...USER, role: 'specialist', roles: ['startup', 'specialist'] };

    it('adds the specialist role to a startup and switches to it', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ ...USER, roles: [] })
        .mockResolvedValue({ ...both, startupProfiles: [] });
      const me = await service.addRole('user-1', 'specialist');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { roles: ['startup', 'specialist'], role: 'specialist' },
      });
      expect(me.roles).toEqual(['startup', 'specialist']);
    });

    it('never adds a role to a manager', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, role: 'manager', roles: [] });
      await expect(service.addRole('user-1', 'startup')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('switches only to a role the account has', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...USER, role: 'specialist', roles: [] });
      await expect(service.switchRole('user-1', 'startup')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      prisma.user.findUnique.mockResolvedValue({ ...both, startupProfiles: [] });
      await service.switchRole('user-1', 'startup');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: 'startup' },
      });
    });

    it('acts as another of its own startups, in its startup role', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...both, startupProfiles: [] });
      await service.switchStartup('user-1', 'startup-2');
      expect(prisma.startupProfile.count).toHaveBeenCalledWith({
        where: { id: 'startup-2', userId: 'user-1' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { activeStartupId: 'startup-2', role: 'startup' },
      });
    });

    it("never acts as someone else's startup", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...both, startupProfiles: [] });
      prisma.startupProfile.count.mockResolvedValue(0);
      await expect(service.switchStartup('user-1', 'theirs')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lists every role and every startup of the account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...USER,
        roles: [],
        startupProfiles: [{ id: 's-1', companyName: 'Acme', logoUrl: null }],
      });
      await expect(service.me('user-1')).resolves.toMatchObject({
        roles: ['startup'],
        startups: [{ id: 's-1', companyName: 'Acme', logoUrl: null }],
      });
    });
  });
});

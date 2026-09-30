import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import type { PrismaService } from '../../prisma/prisma.service';
import { ApplicationsService } from './applications.service';
import type { ApplyDto } from './dto/apply.dto';
import { JobsService } from './jobs.service';

const startup: AuthUser = {
  sub: 'startup-1',
  role: 'startup',
  stellarAddress: 'GSTARTUP',
};
const specialist: AuthUser = {
  sub: 'specialist-1',
  role: 'specialist',
  stellarAddress: 'GSPECIALIST',
};

const dto: ApplyDto = { approach: 'p'.repeat(60), price: 450, estimatedDays: 14 };

describe('ApplicationsService', () => {
  let prisma: {
    job: { findUnique: jest.Mock };
    application: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
    };
    specialistProfile: { findUnique: jest.Mock };
  };
  let service: ApplicationsService;

  beforeEach(() => {
    prisma = {
      job: {
        findUnique: jest.fn().mockResolvedValue({ status: 'open' }),
      },
      application: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      specialistProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
    };
    const client = prisma as unknown as PrismaService;
    service = new ApplicationsService(client, new JobsService(client));
  });

  describe('apply', () => {
    it('applies to an open job', async () => {
      await service.apply(specialist, 'job-1', dto);
      expect(prisma.application.create).toHaveBeenCalledWith({
        data: { ...dto, jobId: 'job-1', specialistId: 'specialist-1' },
      });
    });

    it('refuses a startup', async () => {
      await expect(service.apply(startup, 'job-1', dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses a job that is not open', async () => {
      prisma.job.findUnique.mockResolvedValue({ status: 'closed' });
      await expect(service.apply(specialist, 'job-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.application.create).not.toHaveBeenCalled();
    });

    it('fails when the job does not exist', async () => {
      prisma.job.findUnique.mockResolvedValue(null);
      await expect(service.apply(specialist, 'missing', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('requires a specialist profile first', async () => {
      prisma.specialistProfile.findUnique.mockResolvedValue(null);
      await expect(service.apply(specialist, 'job-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.application.create).not.toHaveBeenCalled();
    });

    it('allows one application per job', async () => {
      prisma.application.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(service.apply(specialist, 'job-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('forJob', () => {
    it('lists the applicants of an owned job with their profile', async () => {
      prisma.job.findUnique.mockResolvedValue({ id: 'job-1', startupId: 'startup-1' });
      prisma.application.findMany.mockResolvedValue([
        {
          id: 'app-1',
          price: '450',
          specialist: {
            specialistProfile: {
              displayName: 'Ana',
              headline: 'Growth',
              avatarUrl: null,
            },
          },
        },
      ]);

      const applicants = await service.forJob(startup, 'job-1');

      expect(applicants).toEqual([
        {
          id: 'app-1',
          price: '450',
          specialist: { displayName: 'Ana', headline: 'Growth', avatarUrl: null },
        },
      ]);
    });

    it("hides another startup's applicants", async () => {
      prisma.job.findUnique.mockResolvedValue({ id: 'job-1', startupId: 'startup-2' });
      await expect(service.forJob(startup, 'job-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.application.findMany).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('withdraws an application still waiting', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        specialistId: 'specialist-1',
        status: 'submitted',
      });

      await service.withdraw(specialist, 'app-1');

      expect(prisma.application.updateMany).toHaveBeenCalledWith({
        where: { id: 'app-1', status: 'submitted' },
        data: expect.objectContaining({ status: 'withdrawn' }),
      });
    });

    it('does not withdraw an application an offer claimed meanwhile', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        specialistId: 'specialist-1',
        status: 'submitted',
      });
      prisma.application.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.withdraw(specialist, 'app-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('does not withdraw once the startup decided', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        specialistId: 'specialist-1',
        status: 'accepted',
      });
      await expect(service.withdraw(specialist, 'app-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("does not withdraw another specialist's application", async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        specialistId: 'specialist-2',
        status: 'submitted',
      });
      await expect(service.withdraw(specialist, 'app-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});

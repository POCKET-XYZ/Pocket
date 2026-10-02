import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth';
import type { PrismaService } from '../../prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateJobDto } from './dto/create-job.dto';
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

function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const dto: CreateJobDto = {
  title: 'Outbound campaign for our wallet',
  description: 'x'.repeat(60),
  category: 'sales',
  deliverables: 'A list of 200 qualified leads',
  budget: 500,
  deadline: futureDate(30),
  milestones: [
    {
      title: 'Lead list',
      description: '200 qualified leads with contact details',
      acceptanceCriteria: 'Every lead has a role, a company and a verified email',
      amount: 300,
      dueDate: futureDate(10),
    },
    {
      title: 'Outreach sequences',
      description: 'Three sequences loaded in the tool',
      acceptanceCriteria: 'Sequences are live and sending',
      amount: 200,
      dueDate: futureDate(25),
    },
  ],
};

describe('JobsService', () => {
  let prisma: {
    job: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    application: { updateMany: jest.Mock };
    startupProfile: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: JobsService;

  beforeEach(() => {
    prisma = {
      job: {
        create: jest.fn(),
        findMany: jest.fn().mockReturnValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockReturnValue(0),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
      application: { updateMany: jest.fn() },
      startupProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
      // A batch runs its operations; an interactive one runs with the client.
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : arg,
      ),
    };
    service = new JobsService(prisma as unknown as PrismaService);
  });

  describe('KPIs', () => {
    /** The errors the validation pipe would answer for this body. */
    async function problems(body: object): Promise<string[]> {
      const errors = await validate(plainToInstance(CreateJobDto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      const flatten = (list: typeof errors): string[] =>
        list.flatMap((error) => [
          ...Object.values(error.constraints ?? {}),
          ...flatten(error.children ?? []),
        ]);
      return flatten(errors);
    }

    it('takes a job with no KPIs', async () => {
      await expect(problems(dto)).resolves.toEqual([]);
    });

    it('takes up to 10 KPIs with an optional target and unit', async () => {
      const kpis: object[] = Array.from({ length: 10 }, (_, i) => ({ name: `KPI ${i + 1}` }));
      kpis[0] = { name: 'Qualified leads', target: '50 per month', unit: 'leads' };
      await expect(problems({ ...dto, kpis })).resolves.toEqual([]);
    });

    it('refuses more than 10 KPIs', async () => {
      const kpis = Array.from({ length: 11 }, (_, i) => ({ name: `KPI ${i + 1}` }));
      await expect(problems({ ...dto, kpis })).resolves.not.toEqual([]);
    });

    it.each([
      ['without a name', { target: '50' }],
      ['with a one letter name', { name: 'x' }],
      ['with a target too long', { name: 'Leads', target: 'x'.repeat(81) }],
      ['with a unit too long', { name: 'Leads', unit: 'x'.repeat(31) }],
      ['with a field nobody asked for', { name: 'Leads', weight: 3 }],
    ])('refuses a KPI %s', async (_label, kpi) => {
      await expect(problems({ ...dto, kpis: [kpi] })).resolves.not.toEqual([]);
    });

    it('stores the KPIs in order, trimmed', async () => {
      await service.create(startup, {
        ...dto,
        kpis: [
          { name: ' Qualified leads ', target: '50 per month', unit: 'leads' },
          { name: 'Reply rate', target: '  ', unit: '%' },
        ],
      });
      const { data } = prisma.job.create.mock.calls[0][0];
      expect(data.kpis).toEqual({
        create: [
          { name: 'Qualified leads', target: '50 per month', unit: 'leads', position: 0 },
          { name: 'Reply rate', unit: '%', position: 1 },
        ],
      });
    });

    it('refuses the same KPI twice', async () => {
      await expect(
        service.create(startup, {
          ...dto,
          kpis: [{ name: 'Qualified leads' }, { name: 'qualified LEADS' }],
        }),
      ).rejects.toThrow('listed twice');
      expect(prisma.job.create).not.toHaveBeenCalled();
    });

    it('refuses a name that is only spaces', async () => {
      await expect(
        service.create(startup, { ...dto, kpis: [{ name: '    ' }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create', () => {
    it('posts a job owned by the startup', async () => {
      await service.create(startup, dto);
      expect(prisma.job.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          startupId: 'startup-1',
          title: dto.title,
          deadline: new Date(dto.deadline),
        }),
      });
    });

    it('refuses a specialist', async () => {
      await expect(service.create(specialist, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses a deadline in the past', async () => {
      await expect(
        service.create(startup, { ...dto, deadline: '2020-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.job.create).not.toHaveBeenCalled();
    });

    it('accepts a deadline of today', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await service.create(startup, {
        ...dto,
        deadline: today,
        milestones: dto.milestones.map((milestone) => ({ ...milestone, dueDate: today })),
      });
      expect(prisma.job.create).toHaveBeenCalled();
    });

    it('refuses milestones that do not add up to the budget', async () => {
      await expect(
        service.create(startup, { ...dto, budget: 600 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.job.create).not.toHaveBeenCalled();
    });

    it('refuses a milestone due after the job deadline', async () => {
      await expect(
        service.create(startup, {
          ...dto,
          milestones: [{ ...dto.milestones[0], amount: 500, dueDate: futureDate(60) }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.job.create).not.toHaveBeenCalled();
    });

    it('stores the milestones in order, with their acceptance criteria', async () => {
      await service.create(startup, dto);
      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            milestones: {
              create: [
                expect.objectContaining({ title: 'Lead list', position: 0 }),
                expect.objectContaining({ title: 'Outreach sequences', position: 1 }),
              ],
            },
          }),
        }),
      );
    });

    it('requires a startup profile first', async () => {
      prisma.startupProfile.findUnique.mockResolvedValue(null);
      await expect(service.create(startup, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.job.create).not.toHaveBeenCalled();
    });
  });

  describe('board', () => {
    it('lists only open jobs, newest first', async () => {
      await service.board({});
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'open' },
          orderBy: { createdAt: 'desc' },
          take: 20,
          skip: 0,
        }),
      );
    });

    it('filters by category and free text', async () => {
      await service.board({ category: 'growth', search: '  wallet ' });
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'open',
            category: 'growth',
            OR: [
              { title: { contains: 'wallet', mode: 'insensitive' } },
              { description: { contains: 'wallet', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('flattens who posted the job and how many applied', async () => {
      prisma.job.findMany.mockReturnValue([
        {
          id: 'job-1',
          title: 'A job',
          startup: { startupProfile: { companyName: 'Acme', logoUrl: null } },
          _count: { applications: 3 },
        },
      ]);
      prisma.job.count.mockReturnValue(1);

      const board = await service.board({});

      expect(board.total).toBe(1);
      expect(board.items[0]).toEqual({
        id: 'job-1',
        title: 'A job',
        startup: { companyName: 'Acme', logoUrl: null },
        applicationCount: 3,
      });
    });
  });

  describe('close', () => {
    it('closes an open job and rejects the applications still waiting', async () => {
      prisma.job.findUnique.mockResolvedValue({
        id: 'job-1',
        startupId: 'startup-1',
        status: 'open',
      });

      await service.close(startup, 'job-1');

      expect(prisma.job.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-1', status: 'open' },
        data: { status: 'closed' },
      });
      expect(prisma.application.updateMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1', status: 'submitted' },
        data: expect.objectContaining({ status: 'rejected' }),
      });
    });

    it('does not close a job that already has someone hired', async () => {
      prisma.job.findUnique.mockResolvedValue({
        id: 'job-1',
        startupId: 'startup-1',
        status: 'in_progress',
      });
      await expect(service.close(startup, 'job-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("does not close another startup's job", async () => {
      prisma.job.findUnique.mockResolvedValue({
        id: 'job-1',
        startupId: 'startup-2',
        status: 'open',
      });
      await expect(service.close(startup, 'job-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('fails when the job does not exist', async () => {
      prisma.job.findUnique.mockResolvedValue(null);
      await expect(service.close(startup, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

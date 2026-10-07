import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth';
import { DOCX_TYPE, XLSX_TYPE } from '../../common/uploads/file-type';
import type { PrismaService } from '../../prisma/prisma.service';
import { docm, docx, xlsm, xlsx } from '../../testing/office-files';
import { JobsController } from './jobs.controller';
import { ReportTemplatesService } from './report-templates.service';

const owner: AuthUser = { sub: 'startup-1', role: 'startup', stellarAddress: 'GS' };
const otherStartup: AuthUser = {
  sub: 'startup-2',
  role: 'startup',
  stellarAddress: 'GX',
};
const specialist: AuthUser = {
  sub: 'specialist-1',
  role: 'specialist',
  stellarAddress: 'GP',
};
const unverified: AuthUser = {
  sub: 'specialist-2',
  role: 'specialist',
  stellarAddress: 'GU',
};
const manager: AuthUser = { sub: 'manager-1', role: 'manager', stellarAddress: 'GM' };

const PDF = Buffer.from('%PDF-1.7 the report to fill');
const CSV = Buffer.from('KPI,Target,Result\nQualified leads,50,\n');
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0]);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
);

const upload = (bytes: Buffer, originalname = 'Monthly report.xlsx') => ({
  buffer: bytes,
  size: bytes.length,
  originalname,
});

describe('ReportTemplatesService', () => {
  let prisma: {
    job: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    jobReportTemplate: { upsert: jest.Mock; deleteMany: jest.Mock };
  };
  let service: ReportTemplatesService;

  function job(status = 'open', template: Buffer | null = xlsx()) {
    prisma.job.findUnique.mockResolvedValue({
      startupId: 'startup-1',
      status,
      reportTemplate: template
        ? { data: new Uint8Array(template), fileName: 'Monthly report.xlsx' }
        : null,
    });
  }

  beforeEach(() => {
    prisma = {
      job: { findUnique: jest.fn() },
      user: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve({
            verificationStatus: where.id === 'specialist-1' ? 'approved' : 'pending',
          }),
        ),
      },
      jobReportTemplate: {
        upsert: jest.fn(({ create }: { create: object }) => Promise.resolve(create)),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new ReportTemplatesService(prisma as unknown as PrismaService);
    job();
  });

  describe('save', () => {
    it.each([
      ['an Excel file', xlsx(true), XLSX_TYPE, 'Monthly report.xlsx'],
      ['a Word file', docx(true), DOCX_TYPE, 'Monthly report.docx'],
      ['a PDF', PDF, 'application/pdf', 'Monthly report.pdf'],
      ['a CSV', CSV, 'text/csv', 'Monthly report.csv'],
    ])('keeps %s with the type read from its bytes', async (_l, bytes, type, name) => {
      await service.save(owner, 'job-1', upload(bytes));
      expect(prisma.jobReportTemplate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobId: 'job-1' },
          update: expect.objectContaining({
            contentType: type,
            fileName: name,
            size: bytes.length,
          }),
        }),
      );
    });

    it.each([
      ['a macro-enabled workbook', xlsm()],
      ['a macro-enabled document', docm()],
      ['a renamed .exe', EXE],
      ['an SVG', SVG],
      ['binary junk named .csv', Buffer.from([0x61, 0x2c, 0x62, 0x00, 0xff])],
      ['an image', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      ['an empty file', Buffer.alloc(0)],
    ])('refuses %s', async (_label, bytes) => {
      await expect(
        service.save(owner, 'job-1', upload(bytes, 'report.csv')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.jobReportTemplate.upsert).not.toHaveBeenCalled();
    });

    it('refuses a file over 5 MB', async () => {
      const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
      await expect(service.save(owner, 'job-1', upload(big))).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(prisma.jobReportTemplate.upsert).not.toHaveBeenCalled();
    });

    it.each([
      ['another startup', otherStartup],
      ['a specialist', specialist],
      ['a manager', manager],
    ])('refuses %s', async (_label, user) => {
      await expect(service.save(user, 'job-1', upload(xlsx()))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it.each(['in_progress', 'completed', 'closed'])(
      'refuses a job that is %s',
      async (status) => {
        job(status);
        await expect(service.save(owner, 'job-1', upload(xlsx()))).rejects.toThrow(
          'while the job is open',
        );
      },
    );

    it('answers not found for a job that does not exist', async () => {
      prisma.job.findUnique.mockResolvedValue(null);
      await expect(service.save(owner, 'nope', upload(xlsx()))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('lets the owner remove it while the job is open', async () => {
      await expect(service.remove(owner, 'job-1')).resolves.toEqual({ deleted: true });
      expect(prisma.jobReportTemplate.deleteMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1' },
      });
    });

    it('refuses another startup', async () => {
      await expect(service.remove(otherStartup, 'job-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.jobReportTemplate.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('fileOf', () => {
    it.each([
      ['the startup that posted the job', owner],
      ['a verified specialist', specialist],
      ['a manager', manager],
    ])('serves it to %s', async (_label, user) => {
      await expect(service.fileOf(user, 'job-1')).resolves.toEqual({
        data: xlsx(),
        contentType: XLSX_TYPE,
        fileName: 'Monthly report.xlsx',
      });
    });

    it('still serves it once someone is hired, for the deliveries', async () => {
      job('in_progress');
      await expect(service.fileOf(specialist, 'job-1')).resolves.toMatchObject({
        contentType: XLSX_TYPE,
      });
    });

    it.each([
      ['another startup', otherStartup],
      ['a specialist not verified yet', unverified],
    ])('refuses %s', async (_label, user) => {
      await expect(service.fileOf(user, 'job-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('does not tell another startup whether there is a file', async () => {
      job('open', null);
      await expect(service.fileOf(otherStartup, 'job-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('answers not found when the job has no template', async () => {
      job('open', null);
      await expect(service.fileOf(specialist, 'job-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('never serves stored bytes that are not a report file', async () => {
      job('open', SVG);
      await expect(service.fileOf(owner, 'job-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

describe('GET /jobs/:id/report-template when signed out', () => {
  const handler = (JobsController.prototype as unknown as Record<string, () => void>)
    .reportTemplate;

  it('is not a public route', () => {
    expect(new Reflector().get(IS_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it('is refused by the sign-in guard', async () => {
    const guard = new JwtAuthGuard(
      new JwtService({ secret: 'a-test-secret-that-is-long-enough-000' }),
      new Reflector(),
      { user: { findUnique: jest.fn() } } as unknown as PrismaService,
    );
    const ctx = {
      getHandler: () => handler,
      getClass: () => JobsController,
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

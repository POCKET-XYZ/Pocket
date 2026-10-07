import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthUser } from '../../common/types/auth';
import type { PrismaService } from '../../prisma/prisma.service';
import { KpiTemplateDto } from './dto/kpi-template.dto';
import { KpiTemplatesService, MAX_KPI_TEMPLATES } from './kpi-templates.service';

const startup: AuthUser = { sub: 'startup-1', role: 'startup', stellarAddress: 'GS' };
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

const body: KpiTemplateDto = {
  name: 'Outbound campaign',
  kpis: [
    { name: 'Qualified leads', target: '50 per month', unit: 'leads' },
    { name: 'Reply rate', unit: '%' },
  ],
};

const stored = {
  id: 'template-1',
  startupId: 'startup-1',
  name: 'Outbound campaign',
  kpis: body.kpis,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

describe('KpiTemplatesService', () => {
  let prisma: {
    kpiTemplate: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let service: KpiTemplatesService;

  beforeEach(() => {
    prisma = {
      kpiTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        // Only the owner's id and the template's id find it.
        findFirst: jest.fn(({ where }: { where: { id: string; startupId: string } }) =>
          Promise.resolve(
            where.id === stored.id && where.startupId === stored.startupId
              ? stored
              : null,
          ),
        ),
        create: jest.fn(({ data }: { data: object }) =>
          Promise.resolve({ ...stored, ...data }),
        ),
        update: jest.fn(({ data }: { data: object }) =>
          Promise.resolve({ ...stored, ...data }),
        ),
        delete: jest.fn().mockResolvedValue(stored),
      },
    };
    service = new KpiTemplatesService(prisma as unknown as PrismaService);
  });

  describe('mine', () => {
    it("lists only the signed-in startup's templates", async () => {
      prisma.kpiTemplate.findMany.mockResolvedValue([stored]);
      await expect(service.mine(startup)).resolves.toEqual([
        {
          id: 'template-1',
          name: 'Outbound campaign',
          kpis: body.kpis,
          createdAt: stored.createdAt,
          updatedAt: stored.updatedAt,
        },
      ]);
      expect(prisma.kpiTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { startupId: 'startup-1' } }),
      );
    });

    it('is only for startups', async () => {
      await expect(service.mine(specialist)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('create', () => {
    it('saves the KPIs in order, trimmed, for the startup', async () => {
      await service.create(startup, {
        name: '  Outbound campaign ',
        kpis: [
          { name: ' Qualified leads ', target: '50 per month', unit: 'leads' },
          { name: 'Reply rate', target: '  ', unit: '%' },
        ],
      });
      expect(prisma.kpiTemplate.create).toHaveBeenCalledWith({
        data: {
          startupId: 'startup-1',
          name: 'Outbound campaign',
          kpis: [
            { name: 'Qualified leads', target: '50 per month', unit: 'leads' },
            { name: 'Reply rate', unit: '%' },
          ],
        },
      });
    });

    it(`refuses a template past the ${MAX_KPI_TEMPLATES} a startup can keep`, async () => {
      prisma.kpiTemplate.findMany.mockResolvedValue(
        Array.from({ length: MAX_KPI_TEMPLATES }, (_, i) => ({
          id: `t-${i}`,
          name: `Template ${i}`,
        })),
      );
      await expect(service.create(startup, body)).rejects.toThrow('up to 20 templates');
      expect(prisma.kpiTemplate.create).not.toHaveBeenCalled();
    });

    it('takes the twentieth template', async () => {
      prisma.kpiTemplate.findMany.mockResolvedValue(
        Array.from({ length: MAX_KPI_TEMPLATES - 1 }, (_, i) => ({
          id: `t-${i}`,
          name: `Template ${i}`,
        })),
      );
      await service.create(startup, body);
      expect(prisma.kpiTemplate.create).toHaveBeenCalled();
    });

    it('refuses a name the startup already uses, ignoring case', async () => {
      prisma.kpiTemplate.findMany.mockResolvedValue([
        { id: 'template-1', name: 'Outbound campaign' },
      ]);
      await expect(
        service.create(startup, { ...body, name: 'OUTBOUND Campaign' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses the same KPI twice, ignoring case, like a job', async () => {
      await expect(
        service.create(startup, {
          ...body,
          kpis: [{ name: 'Qualified leads' }, { name: 'qualified LEADS' }],
        }),
      ).rejects.toThrow('listed twice');
    });

    it.each([
      ['a name of only spaces', { ...body, name: '    ' }],
      ['a KPI name of only spaces', { ...body, kpis: [{ name: '   ' }] }],
      ['no KPIs', { ...body, kpis: [] }],
    ])('refuses %s', async (_label, dto) => {
      await expect(service.create(startup, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.kpiTemplate.create).not.toHaveBeenCalled();
    });

    it('is only for startups', async () => {
      await expect(service.create(specialist, body)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('renames and replaces the KPIs of its own template', async () => {
      await service.update(startup, 'template-1', {
        name: 'Outbound, v2',
        kpis: [{ name: 'Meetings booked', target: '10' }],
      });
      expect(prisma.kpiTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-1' },
        data: { name: 'Outbound, v2', kpis: [{ name: 'Meetings booked', target: '10' }] },
      });
    });

    it('keeps its own name when only the KPIs change', async () => {
      await service.update(startup, 'template-1', body);
      expect(prisma.kpiTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { startupId: 'startup-1', id: { not: 'template-1' } },
        }),
      );
      expect(prisma.kpiTemplate.update).toHaveBeenCalled();
    });

    it('refuses the name of another of its templates', async () => {
      prisma.kpiTemplate.findMany.mockResolvedValue([
        { id: 'template-2', name: 'Content plan' },
      ]);
      await expect(
        service.update(startup, 'template-1', { ...body, name: 'content PLAN' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("answers not found for another startup's template", async () => {
      await expect(
        service.update(otherStartup, 'template-1', body),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.kpiTemplate.update).not.toHaveBeenCalled();
    });

    it('answers not found for a template that does not exist', async () => {
      await expect(service.update(startup, 'nope', body)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes its own template', async () => {
      await expect(service.remove(startup, 'template-1')).resolves.toEqual({
        deleted: true,
      });
      expect(prisma.kpiTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'template-1' },
      });
    });

    it("answers not found for another startup's template", async () => {
      await expect(service.remove(otherStartup, 'template-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.kpiTemplate.delete).not.toHaveBeenCalled();
    });

    it('is only for startups', async () => {
      await expect(service.remove(specialist, 'template-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});

/** The same limits as a job's KPIs, checked by the validation pipe. */
describe('KpiTemplateDto', () => {
  async function problems(dto: object): Promise<string[]> {
    const errors = await validate(plainToInstance(KpiTemplateDto, dto), {
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

  it('takes a name and up to 10 KPIs with an optional target and unit', async () => {
    const kpis: object[] = Array.from({ length: 10 }, (_, i) => ({
      name: `KPI ${i + 1}`,
    }));
    kpis[0] = { name: 'Qualified leads', target: '50 per month', unit: 'leads' };
    await expect(problems({ name: 'Outbound', kpis })).resolves.toEqual([]);
  });

  it('refuses more than 10 KPIs', async () => {
    const kpis = Array.from({ length: 11 }, (_, i) => ({ name: `KPI ${i + 1}` }));
    await expect(problems({ name: 'Outbound', kpis })).resolves.not.toEqual([]);
  });

  it.each([
    ['without a name', { kpis: body.kpis }],
    ['with a one letter name', { name: 'x', kpis: body.kpis }],
    ['with a name over 80 characters', { name: 'x'.repeat(81), kpis: body.kpis }],
    ['without KPIs', { name: 'Outbound', kpis: [] }],
    ['with a field nobody asked for', { ...body, public: true }],
  ])('refuses a template %s', async (_label, dto) => {
    await expect(problems(dto)).resolves.not.toEqual([]);
  });

  it.each([
    ['without a name', { target: '50' }],
    ['with a one letter name', { name: 'x' }],
    ['with a name over 80 characters', { name: 'x'.repeat(81) }],
    ['with a target too long', { name: 'Leads', target: 'x'.repeat(81) }],
    ['with a unit too long', { name: 'Leads', unit: 'x'.repeat(31) }],
    ['with a field nobody asked for', { name: 'Leads', weight: 3 }],
  ])('refuses a KPI %s, as a job does', async (_label, kpi) => {
    await expect(problems({ name: 'Outbound', kpis: [kpi] })).resolves.not.toEqual([]);
  });
});

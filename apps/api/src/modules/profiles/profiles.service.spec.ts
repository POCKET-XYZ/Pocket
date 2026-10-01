import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SpecialistProfileDto } from './dto/specialist-profile.dto';
import type { StartupProfileDto } from './dto/startup-profile.dto';
import { ProfilesService } from './profiles.service';

const STARTUP: AuthUser = { sub: 'user-1', role: 'startup', stellarAddress: 'G...' };
const SPECIALIST: AuthUser = {
  sub: 'user-2',
  role: 'specialist',
  stellarAddress: 'G...',
};

const STARTUP_DTO = {
  companyName: 'Acme',
  oneLiner: 'We sell rockets to coyotes',
  sector: 'Logistics',
  stage: 'seed',
  lookingFor: 'Someone to fix our outbound funnel end to end',
} as StartupProfileDto;

const SPECIALIST_DTO = {
  displayName: 'Ana Rojas',
  headline: 'B2B SaaS outbound specialist',
  bio: 'x'.repeat(60),
  categories: ['sales'],
  linkedinUrl: 'https://linkedin.com/in/example',
} as SpecialistProfileDto;

describe('ProfilesService', () => {
  let prisma: {
    startupProfile: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    specialistProfile: {
      upsert: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    specialistCv: { upsert: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: ProfilesService;

  beforeEach(() => {
    prisma = {
      startupProfile: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      specialistProfile: {
        upsert: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findUnique: jest.fn() },
      specialistCv: { upsert: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    };
    service = new ProfilesService(prisma as unknown as PrismaService);
  });

  it('saves the startup profile of a startup', async () => {
    await service.saveStartup(STARTUP, STARTUP_DTO);
    expect(prisma.startupProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { ...STARTUP_DTO, userId: 'user-1' },
      update: {
        ...STARTUP_DTO,
        websiteUrl: null,
        logoUrl: null,
        legalName: null,
        contactRole: null,
        languages: [],
        location: null,
      },
    });
  });

  it('empties the optional fields a specialist cleared', async () => {
    // As the validation pipe hands it over: absent fields exist, as undefined.
    await service.saveSpecialist(SPECIALIST, {
      ...SPECIALIST_DTO,
      timezone: undefined,
      skills: undefined,
    } as SpecialistProfileDto);
    const { update } = prisma.specialistProfile.upsert.mock.calls[0][0];
    expect(update).toMatchObject({ displayName: SPECIALIST_DTO.displayName });
    for (const key of ['skills', 'tools', 'languages', 'caseStudies']) {
      if (!(key in SPECIALIST_DTO)) expect(update[key]).toEqual([]);
    }
    for (const key of ['timezone', 'hourlyRate', 'portfolioUrl', 'location']) {
      if (!(key in SPECIALIST_DTO)) expect(update[key]).toBeNull();
    }
  });

  it('does not let a specialist save a startup profile', async () => {
    await expect(service.saveStartup(SPECIALIST, STARTUP_DTO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('asks for a LinkedIn, a portfolio or a CV', async () => {
    const withoutLinks: Partial<SpecialistProfileDto> = { ...SPECIALIST_DTO };
    delete withoutLinks.linkedinUrl;
    await expect(
      service.saveSpecialist(SPECIALIST, withoutLinks as SpecialistProfileDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.specialistProfile.upsert).not.toHaveBeenCalled();
  });

  it('takes a CV as the only way to check a specialist', async () => {
    const onlyCv: Partial<SpecialistProfileDto> = {
      ...SPECIALIST_DTO,
      cvUrl: 'https://drive.google.com/file/d/cv',
    };
    delete onlyCv.linkedinUrl;
    await service.saveSpecialist(SPECIALIST, onlyCv as SpecialistProfileDto);
    expect(prisma.specialistProfile.upsert).toHaveBeenCalled();
  });

  it('lists only approved startups, with how many jobs each has open', async () => {
    prisma.startupProfile.findMany.mockResolvedValue([
      { id: 'p-1', companyName: 'North Loop', user: { _count: { jobs: 2 } } },
    ]);
    prisma.startupProfile.count.mockResolvedValue(1);

    const directory = await service.browseStartups({ search: 'loop' });

    const query = prisma.startupProfile.findMany.mock.calls[0][0] as {
      where: { user: unknown; OR: unknown[] };
    };
    expect(query.where.user).toEqual({ verificationStatus: 'approved' });
    expect(query.where.OR).toHaveLength(3);
    expect(directory.items).toEqual([
      { id: 'p-1', companyName: 'North Loop', openJobs: 2 },
    ]);
    expect(directory.total).toBe(1);
  });

  it('does not let a startup save a specialist profile', async () => {
    await expect(service.saveSpecialist(STARTUP, SPECIALIST_DTO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns null as the profile of a manager', async () => {
    const manager: AuthUser = { sub: 'm-1', role: 'manager', stellarAddress: 'G...' };
    await expect(service.mine(manager)).resolves.toBeNull();
  });

  it('lists only approved specialists', async () => {
    await service.browseSpecialists({});
    expect(prisma.specialistProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: { verificationStatus: 'approved' } }),
        take: 20,
        skip: 0,
      }),
    );
  });

  it('filters the directory by category', async () => {
    await service.browseSpecialists({ category: 'growth' });
    expect(prisma.specialistProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categories: { has: 'growth' } }),
      }),
    );
  });

  it('hides the profile of a user who is not approved', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      verificationStatus: 'pending',
      startupProfile: { id: 'p-1' },
      specialistProfile: null,
    });
    await expect(service.publicProfile('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the public profile of an approved user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      role: 'startup',
      stellarAddress: 'GABC',
      createdAt: new Date('2026-09-01'),
      verificationStatus: 'approved',
      startupProfile: { id: 'p-1' },
      specialistProfile: null,
    });
    await expect(service.publicProfile('user-1')).resolves.toMatchObject({
      userId: 'user-1',
      role: 'startup',
      profile: { id: 'p-1' },
    });
  });

  describe('CV', () => {
    const URL = 'https://api.example/api/profiles/user-2/cv';
    const pdf = (body: string) => ({ buffer: Buffer.from(body), size: body.length });

    it('keeps a PDF and links it from the profile', async () => {
      await expect(
        service.saveCv(SPECIALIST, pdf('%PDF-1.7 a real cv'), URL),
      ).resolves.toEqual({ cvUrl: URL });
      expect(prisma.specialistCv.upsert).toHaveBeenCalled();
      expect(prisma.specialistProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: SPECIALIST.sub },
        data: { cvUrl: URL },
      });
    });

    it.each([
      ['a page dressed as a PDF', '<html><script>alert(1)</script>'],
      ['an image', 'PNG image bytes'],
      ['an empty file', ''],
    ])('refuses %s', async (_label, body) => {
      await expect(service.saveCv(SPECIALIST, pdf(body), URL)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.specialistCv.upsert).not.toHaveBeenCalled();
    });

    it('only shows the CV of an approved specialist', async () => {
      prisma.specialistCv.findFirst.mockResolvedValue(null);
      await expect(service.cvOf('user-2')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.specialistCv.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-2', user: { verificationStatus: 'approved' } },
      });
    });
  });
});

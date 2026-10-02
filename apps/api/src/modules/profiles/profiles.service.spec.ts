import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
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
      updateMany: jest.Mock;
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
    startupLogo: { upsert: jest.Mock; findFirst: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: ProfilesService;

  beforeEach(() => {
    prisma = {
      startupProfile: {
        upsert: jest.fn(),
        updateMany: jest.fn(),
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
      startupLogo: { upsert: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
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
    });
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

  describe('logo', () => {
    const URL = 'https://api.example/api/profiles/user-1/logo?v=abc';
    const file = (bytes: Buffer) => ({ buffer: bytes, size: bytes.length });
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
    const WEBP = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x24, 0, 0, 0]),
      Buffer.from('WEBPVP8 '),
    ]);

    it.each([
      ['a PNG', PNG, 'image/png'],
      ['a JPEG', JPEG, 'image/jpeg'],
      ['a WebP', WEBP, 'image/webp'],
    ])('keeps %s with the type read from its bytes', async (_label, bytes, type) => {
      await expect(service.saveLogo(STARTUP, file(bytes), URL)).resolves.toEqual({
        logoUrl: URL,
      });
      expect(prisma.startupLogo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          update: expect.objectContaining({ contentType: type, size: bytes.length }),
        }),
      );
      expect(prisma.startupProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { logoUrl: URL },
      });
    });

    it.each([
      [
        'an SVG',
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
      ],
      ['a GIF', Buffer.from('GIF89a and the rest of a GIF')],
      // Named logo.png by whoever sent it: the name and claimed type are ignored.
      ['a page renamed to .png', Buffer.from('<html><script>alert(1)</script></html>')],
      ['a PDF', Buffer.from('%PDF-1.7 not an image')],
      ['an empty file', Buffer.alloc(0)],
    ])('refuses %s', async (_label, bytes) => {
      await expect(service.saveLogo(STARTUP, file(bytes), URL)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.startupLogo.upsert).not.toHaveBeenCalled();
    });

    it('refuses a logo over 1 MB', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
      await expect(service.saveLogo(STARTUP, file(big), URL)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(prisma.startupLogo.upsert).not.toHaveBeenCalled();
    });

    it('only takes a logo from a startup', async () => {
      await expect(service.saveLogo(SPECIALIST, file(PNG), URL)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.startupLogo.upsert).not.toHaveBeenCalled();
    });

    it('removes the uploaded logo and the link to it', async () => {
      await expect(service.removeLogo(STARTUP)).resolves.toEqual({ logoUrl: null });
      expect(prisma.startupLogo.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.startupProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { logoUrl: null },
      });
    });

    it('does not let a specialist remove a logo', async () => {
      await expect(service.removeLogo(SPECIALIST)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('drops the uploaded logo when a pasted link replaces it', async () => {
      await service.saveStartup(STARTUP, {
        ...STARTUP_DTO,
        logoUrl: 'https://cdn.example/acme.png',
      });
      expect(prisma.startupLogo.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('keeps the uploaded logo while the profile still shows it', async () => {
      await service.saveStartup(STARTUP, { ...STARTUP_DTO, logoUrl: URL });
      expect(prisma.startupLogo.deleteMany).not.toHaveBeenCalled();
    });

    it('serves only the logo of an approved startup, with its real type', async () => {
      prisma.startupLogo.findFirst.mockResolvedValue({ data: new Uint8Array(PNG) });
      await expect(service.logoOf('user-1')).resolves.toEqual({
        data: PNG,
        contentType: 'image/png',
      });
      expect(prisma.startupLogo.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', user: { verificationStatus: 'approved' } },
      });
    });

    it('answers not found when there is no logo', async () => {
      prisma.startupLogo.findFirst.mockResolvedValue(null);
      await expect(service.logoOf('user-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

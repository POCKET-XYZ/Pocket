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
    startupProfile: { upsert: jest.Mock; findUnique: jest.Mock };
    specialistProfile: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: ProfilesService;

  beforeEach(() => {
    prisma = {
      startupProfile: { upsert: jest.fn(), findUnique: jest.fn() },
      specialistProfile: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    };
    service = new ProfilesService(prisma as unknown as PrismaService);
  });

  it('saves the startup profile of a startup', async () => {
    await service.saveStartup(STARTUP, STARTUP_DTO);
    expect(prisma.startupProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { ...STARTUP_DTO, userId: 'user-1' },
      update: STARTUP_DTO,
    });
  });

  it('does not let a specialist save a startup profile', async () => {
    await expect(service.saveStartup(SPECIALIST, STARTUP_DTO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('asks for a LinkedIn or a portfolio', async () => {
    const withoutLinks: Partial<SpecialistProfileDto> = { ...SPECIALIST_DTO };
    delete withoutLinks.linkedinUrl;
    await expect(
      service.saveSpecialist(SPECIALIST, withoutLinks as SpecialistProfileDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.specialistProfile.upsert).not.toHaveBeenCalled();
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
});

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SpecialistProfile, type StartupProfile } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import { BrowseSpecialistsDto } from './dto/browse-specialists.dto';
import { BrowseStartupsDto } from './dto/browse-startups.dto';
import { SpecialistProfileDto } from './dto/specialist-profile.dto';
import { StartupProfileDto } from './dto/startup-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create or replace the startup profile of the signed-in user. */
  async saveStartup(user: AuthUser, dto: StartupProfileDto): Promise<StartupProfile> {
    if (user.role !== 'startup') {
      throw new ForbiddenException('Only startups have a startup profile');
    }
    return await this.prisma.startupProfile.upsert({
      where: { userId: user.sub },
      create: { ...dto, userId: user.sub },
      update: dto,
    });
  }

  /** Create or replace the specialist profile of the signed-in user. */
  async saveSpecialist(
    user: AuthUser,
    dto: SpecialistProfileDto,
  ): Promise<SpecialistProfile> {
    if (user.role !== 'specialist') {
      throw new ForbiddenException('Only specialists have a specialist profile');
    }
    if (!dto.linkedinUrl && !dto.portfolioUrl && !dto.cvUrl) {
      // A profile nobody can check is worth nothing to a startup choosing.
      throw new BadRequestException(
        'Add your LinkedIn, your portfolio or your CV, at least one',
      );
    }

    // Case studies are stored as JSON: a link with the result it achieved.
    const { caseStudies, ...rest } = dto;
    const data = {
      ...rest,
      ...(caseStudies
        ? { caseStudies: caseStudies as unknown as Prisma.InputJsonValue }
        : {}),
    };
    return await this.prisma.specialistProfile.upsert({
      where: { userId: user.sub },
      create: { ...data, userId: user.sub },
      update: data,
    });
  }

  /** The profile of the signed-in user, or null when it is not filled in yet. */
  async mine(user: AuthUser): Promise<StartupProfile | SpecialistProfile | null> {
    if (user.role === 'startup') {
      return this.prisma.startupProfile.findUnique({ where: { userId: user.sub } });
    }
    if (user.role === 'specialist') {
      return this.prisma.specialistProfile.findUnique({ where: { userId: user.sub } });
    }
    return null;
  }

  /**
   * Public directory of startups, so a specialist can see who is hiring before
   * applying. Only approved accounts, like the specialist directory, and each
   * one with how many jobs it has open right now.
   */
  async browseStartups(query: BrowseStartupsDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const search = query.search?.trim();

    const where: Prisma.StartupProfileWhereInput = {
      user: { verificationStatus: 'approved' },
      ...(search
        ? {
            OR: [
              { companyName: { contains: search, mode: 'insensitive' } },
              { oneLiner: { contains: search, mode: 'insensitive' } },
              { sector: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [profiles, total] = await this.prisma.$transaction([
      this.prisma.startupProfile.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { _count: { select: { jobs: { where: { status: 'open' } } } } },
          },
        },
      }),
      this.prisma.startupProfile.count({ where }),
    ]);

    const items = profiles.map(({ user, ...profile }) => ({
      ...profile,
      openJobs: user._count.jobs,
    }));
    return { items, total, limit, offset };
  }

  /**
   * Public directory of specialists. Only approved accounts are listed, so the
   * marketplace never shows anyone a manager has not reviewed.
   */
  async browseSpecialists(query: BrowseSpecialistsDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const search = query.search?.trim();

    const where: Prisma.SpecialistProfileWhereInput = {
      user: { verificationStatus: 'approved' },
      ...(query.category ? { categories: { has: query.category } } : {}),
      ...(search
        ? {
            OR: [
              { headline: { contains: search, mode: 'insensitive' } },
              { bio: { contains: search, mode: 'insensitive' } },
              { skills: { has: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.specialistProfile.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.specialistProfile.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /** Public profile of an approved user. Unverified accounts stay hidden. */
  async publicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { startupProfile: true, specialistProfile: true },
    });
    if (!user || user.verificationStatus !== 'approved') {
      throw new NotFoundException('Profile not found');
    }

    const profile = user.startupProfile ?? user.specialistProfile;
    if (!profile) throw new NotFoundException('Profile not found');

    return {
      userId: user.id,
      role: user.role,
      // Shortened: a public page must not tie a person's name to a wallet
      // anyone can read the balance and payments of.
      wallet: `${user.stellarAddress.slice(0, 4)}...${user.stellarAddress.slice(-4)}`,
      memberSince: user.createdAt,
      profile,
    };
  }
}

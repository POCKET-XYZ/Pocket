import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAccountActive } from '@pocket/shared';
import { Prisma, type SpecialistProfile, type StartupProfile } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import { securityEvent } from '../../common/security/security-log';
import {
  isPdf,
  sniffImage,
  type ImageType,
  type UploadedBytes,
} from '../../common/uploads/file-type';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_SPECIALIST, IDENTITY_SELECT, identityVerified } from '../users/identity';
import {
  matchesWaiting,
  pageWithWaiting,
  waitingProfile,
  type WaitingRow,
} from './waiting-profiles';
import { BrowseSpecialistsDto } from './dto/browse-specialists.dto';
import { BrowseStartupsDto } from './dto/browse-startups.dto';
import { SpecialistProfileDto } from './dto/specialist-profile.dto';
import { StartupProfileDto } from './dto/startup-profile.dto';

/** An uploaded file as Nest hands it over, kept in memory. */
export type UploadedPdf = UploadedBytes;

/**
 * Optional fields and their empty value. Saving a profile replaces it, so a
 * field the form no longer sends was cleared and is emptied too.
 */
const STARTUP_OPTIONAL = {
  websiteUrl: null,
  socialPlatform: null,
  socialUrl: null,
  logoUrl: null,
  legalName: null,
  contactRole: null,
  languages: [],
  location: null,
};
const SPECIALIST_OPTIONAL = {
  skills: [],
  caseStudies: [],
  tools: [],
  yearsExperience: null,
  languages: [],
  timezone: null,
  weeklyHours: null,
  hourlyRate: null,
  minProjectBudget: null,
  portfolioUrl: null,
  linkedinUrl: null,
  cvUrl: null,
  avatarUrl: null,
  location: null,
  socialAccounts: [],
  niches: [],
  audienceCountries: [],
};

/**
 * A specialist profile as anyone can see it. The rate is not shown on Pocket
 * any more, so it does not leave the API either, older profiles included.
 */
export function publicSpecialist<T extends object>(
  profile: T,
): Omit<T, 'hourlyRate' | 'minProjectBudget'> {
  const rest: Record<string, unknown> = { ...(profile as Record<string, unknown>) };
  delete rest.hourlyRate;
  delete rest.minProjectBudget;
  return rest as Omit<T, 'hourlyRate' | 'minProjectBudget'>;
}

/** A creator's account as stored: the declared figures and when they last changed. */
interface StoredAccount {
  platform: string;
  url: string;
  followers?: number;
  avgViews?: number;
  statsUpdatedAt?: string;
}

/**
 * The accounts to store. A figure the creator changed, or a new account,
 * gets today's date; an unchanged one keeps the date it had, so a startup
 * can tell how fresh each number is.
 */
export function withStatsDates(
  sent: { platform: string; url: string; followers?: number; avgViews?: number }[],
  before: unknown,
  now: Date,
): StoredAccount[] {
  const previous = Array.isArray(before) ? (before as StoredAccount[]) : [];
  return sent.map((account) => {
    const old = previous.find(
      (each) => each.platform === account.platform && each.url === account.url,
    );
    const same =
      old !== undefined &&
      old.followers === account.followers &&
      old.avgViews === account.avgViews;
    const hasFigures = account.followers !== undefined || account.avgViews !== undefined;
    return {
      platform: account.platform,
      url: account.url,
      ...(account.followers !== undefined ? { followers: account.followers } : {}),
      ...(account.avgViews !== undefined ? { avgViews: account.avgViews } : {}),
      ...(hasFigures
        ? {
            statsUpdatedAt:
              same && old.statsUpdatedAt ? old.statsUpdatedAt : now.toISOString(),
          }
        : {}),
    };
  });
}

/**
 * Only the fields actually sent. The validated DTO is a class instance whose
 * absent fields exist as undefined, and those would hide the empty values.
 */
function given<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** The largest CV Pocket keeps: a designed PDF with images fits. */
export const MAX_CV_BYTES = 10 * 1024 * 1024;

/** The largest logo Pocket keeps. A logo is shown small; 1 MB is plenty. */
export const MAX_LOGO_BYTES = 1024 * 1024;

/** A wallet as public pages show it: enough to recognise it, not to look it up. */
function shortWallet(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/** How many startups one account can own. */
export const MAX_STARTUPS_PER_ACCOUNT = 10;

/**
 * Whether a logo link points at the logo this startup uploaded, served by the
 * API. Anything else is a link the startup pasted.
 */
function isUploadedLogo(url: string | undefined, startupId: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.endsWith(`/profiles/${startupId}/logo`);
  } catch {
    return false;
  }
}

@Injectable()
export class ProfilesService {
  private readonly apiBase: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.apiBase = config.get<string>('apiPublicUrl') ?? '';
  }

  /** Accounts moved from the test network and not claimed yet, oldest first. */
  private waitingRows(role: 'startup' | 'specialist'): Promise<WaitingRow[]> {
    return this.prisma.migratedAccount.findMany({
      where: { role, claimedById: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, profile: true, createdAt: true },
    });
  }

  /**
   * Save the startup the signed-in account acts as. An account with no
   * startup yet gets its first one, which becomes its active one.
   */
  async saveStartup(user: AuthUser, dto: StartupProfileDto): Promise<StartupProfile> {
    if (user.role !== 'startup') {
      throw new ForbiddenException('Solo las empresas tienen perfil de empresa');
    }
    const active = await this.activeStartup(user.sub);
    const profile = active
      ? await this.prisma.startupProfile.update({
          where: { id: active.id },
          data: { ...STARTUP_OPTIONAL, ...given(dto) },
        })
      : await this.createStartup(user.sub, dto);
    // The last logo set wins: a pasted link, or none, replaces the uploaded
    // one, which is then not kept around nor served.
    if (!isUploadedLogo(dto.logoUrl, profile.id)) {
      await this.prisma.startupLogo.deleteMany({ where: { startupProfileId: profile.id } });
    }
    return profile;
  }

  /**
   * Another startup for the signed-in account, which then acts as it: one
   * person can run several companies with the same wallet and identity check.
   */
  async addStartup(user: AuthUser, dto: StartupProfileDto): Promise<StartupProfile> {
    if (user.role !== 'startup') {
      throw new ForbiddenException('Solo las empresas tienen perfil de empresa');
    }
    const owned = await this.prisma.startupProfile.count({ where: { userId: user.sub } });
    if (owned >= MAX_STARTUPS_PER_ACCOUNT) {
      throw new BadRequestException(
        `Una cuenta puede tener hasta ${MAX_STARTUPS_PER_ACCOUNT} empresas`,
      );
    }
    const profile = await this.createStartup(user.sub, dto);
    securityEvent('startup_added', { userId: user.sub, startupId: profile.id });
    return profile;
  }

  /** A new startup for the account, made its active one. */
  private createStartup(userId: string, dto: StartupProfileDto): Promise<StartupProfile> {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.startupProfile.create({ data: { ...dto, userId } });
      await tx.user.update({ where: { id: userId }, data: { activeStartupId: profile.id } });
      return profile;
    });
  }

  /** The startup the account acts as, or null when it has none yet. */
  private async activeStartup(userId: string): Promise<StartupProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { startupProfile: true },
    });
    return user?.startupProfile ?? null;
  }

  /** Create or replace the specialist profile of the signed-in user. */
  async saveSpecialist(
    user: AuthUser,
    dto: SpecialistProfileDto,
  ): Promise<SpecialistProfile> {
    if (user.role !== 'specialist') {
      throw new ForbiddenException('Solo los expertos tienen perfil de experto');
    }
    // A profile nobody can check is worth nothing to a startup choosing: a
    // creator shows their accounts, anyone else a link to their work.
    const creator = dto.categories.includes('content');
    if (creator) {
      const platforms = new Set((dto.socialAccounts ?? []).map((each) => each.platform));
      if (platforms.size < 2) {
        throw new BadRequestException('Agrega al menos 2 redes de plataformas distintas');
      }
    } else if (!dto.linkedinUrl && !dto.portfolioUrl && !dto.cvUrl) {
      throw new BadRequestException(
        'Agrega al menos uno: tu LinkedIn, tu portafolio o tu CV',
      );
    }

    // Case studies and accounts are stored as JSON.
    const { caseStudies, socialAccounts, ...rest } = dto;
    const before = socialAccounts
      ? await this.prisma.specialistProfile.findUnique({
          where: { userId: user.sub },
          select: { socialAccounts: true },
        })
      : null;
    const data = {
      ...rest,
      ...(caseStudies
        ? { caseStudies: caseStudies as unknown as Prisma.InputJsonValue }
        : {}),
      ...(socialAccounts
        ? {
            socialAccounts: withStatsDates(
              socialAccounts,
              before?.socialAccounts,
              new Date(),
            ) as unknown as Prisma.InputJsonValue,
          }
        : {}),
    };
    return await this.prisma.specialistProfile.upsert({
      where: { userId: user.sub },
      create: { ...data, userId: user.sub },
      update: { ...SPECIALIST_OPTIONAL, ...given(data) },
    });
  }

  /** The profile of the signed-in user, or null when it is not filled in yet. */
  async mine(user: AuthUser): Promise<StartupProfile | SpecialistProfile | null> {
    if (user.role === 'startup') return this.activeStartup(user.sub);
    if (user.role === 'specialist') {
      return this.prisma.specialistProfile.findUnique({ where: { userId: user.sub } });
    }
    return null;
  }

  /**
   * Public directory of startups, so a specialist can see who is hiring before
   * applying. Only approved accounts (a startup verifies its identity first),
   * each one with how many jobs it has open right now.
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
        include: { _count: { select: { jobs: { where: { status: 'open' } } } } },
      }),
      this.prisma.startupProfile.count({ where }),
    ]);

    // Each startup on its own, even two run by the same person.
    const items = profiles.map(({ _count, ...profile }) => ({
      ...profile,
      openJobs: _count.jobs,
    }));
    // Then the startups still to claim their account from the test network.
    const waiting = (await this.waitingRows('startup'))
      .map((row) => waitingProfile(row, this.apiBase))
      .filter((profile) => matchesWaiting('startup', profile, { search }))
      .map((profile) => ({ ...profile, openJobs: 0, waiting: true }));
    const page = pageWithWaiting(items, total, waiting, offset, limit);
    return { items: page.items, total: page.total, limit, offset };
  }

  /**
   * Public directory of specialists: every active one, so whoever applies can
   * be looked up. Each says whether they passed the identity check, which they
   * need to accept a contract.
   */
  async browseSpecialists(query: BrowseSpecialistsDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const search = query.search?.trim();

    const where: Prisma.SpecialistProfileWhereInput = {
      user: { verificationStatus: { in: ACTIVE_SPECIALIST } },
      ...(query.category ? { categories: { has: query.category } } : {}),
      ...(search
        ? {
            OR: [
              { headline: { contains: search, mode: 'insensitive' } },
              { bio: { contains: search, mode: 'insensitive' } },
              { skills: { has: search } },
              { niches: { has: search } },
            ],
          }
        : {}),
    };

    const [profiles, total] = await this.prisma.$transaction([
      this.prisma.specialistProfile.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: { user: { select: IDENTITY_SELECT } },
      }),
      this.prisma.specialistProfile.count({ where }),
    ]);

    const items = profiles.map(({ user, ...profile }) => ({
      ...publicSpecialist(profile),
      identityVerified: identityVerified(user),
    }));
    // Then the specialists still to claim their account from the test network.
    const waiting = (await this.waitingRows('specialist'))
      .map((row) => waitingProfile(row, this.apiBase))
      .filter((profile) =>
        matchesWaiting('specialist', profile, { category: query.category, search }),
      )
      .map((profile) => ({
        ...publicSpecialist(profile),
        identityVerified: false,
        waiting: true,
      }));
    const page = pageWithWaiting(items, total, waiting, offset, limit);
    return { items: page.items, total: page.total, limit, offset };
  }

  /**
   * Store the signed-in specialist's CV. Only a real PDF is kept: the file is
   * read, not trusted for its name or type. Returns the link to it, which is
   * also saved on the profile when there is one.
   */
  async saveCv(user: AuthUser, file: UploadedPdf | undefined, cvUrl: string) {
    if (!file?.buffer.length) throw new BadRequestException('Elige un archivo PDF');
    if (!isPdf(file.buffer)) {
      throw new BadRequestException('Sube tu CV en PDF');
    }
    const data = new Uint8Array(file.buffer);
    await this.prisma.specialistCv.upsert({
      where: { userId: user.sub },
      create: { userId: user.sub, data, size: data.length },
      update: { data, size: data.length },
    });
    await this.prisma.specialistProfile.updateMany({
      where: { userId: user.sub },
      data: { cvUrl },
    });
    return { cvUrl };
  }

  /** The CV of an active specialist, for anyone who can see their profile. */
  async cvOf(userId: string): Promise<Buffer> {
    const cv = await this.prisma.specialistCv.findFirst({
      where: { userId, user: { verificationStatus: { in: ACTIVE_SPECIALIST } } },
    });
    if (cv) return Buffer.from(cv.data);
    // The CV of a specialist still to claim their account from the test network.
    const waiting = await this.prisma.migratedAccount.findFirst({
      where: { id: userId, role: 'specialist', claimedById: null },
      select: { cv: true },
    });
    if (!waiting?.cv) throw new NotFoundException('No encontramos el CV');
    return Buffer.from(waiting.cv);
  }

  /**
   * Store the signed-in startup's logo, replacing the one before. Only a real
   * PNG, JPEG or WebP is kept, read from its bytes: never an SVG, which is a
   * document that can carry script. The profile then shows it.
   */
  async saveLogo(
    user: AuthUser,
    file: UploadedBytes | undefined,
    addressOf: (startupId: string) => string,
  ) {
    if (user.role !== 'startup') {
      throw new ForbiddenException('Solo las empresas tienen logo');
    }
    const startup = await this.activeStartup(user.sub);
    if (!startup) {
      throw new BadRequestException(
        'Guarda primero el perfil de tu empresa y después sube su logo',
      );
    }
    if (!file?.buffer.length) throw new BadRequestException('Elige un archivo de imagen');
    if (file.buffer.length > MAX_LOGO_BYTES) {
      throw new PayloadTooLargeException(
        'El logo es demasiado grande. El límite es de 1 MB',
      );
    }
    const contentType = sniffImage(file.buffer);
    if (!contentType) {
      throw new BadRequestException('Sube tu logo como imagen PNG, JPEG o WebP');
    }
    const data = new Uint8Array(file.buffer);
    const logoUrl = addressOf(startup.id);
    await this.prisma.startupLogo.upsert({
      where: { startupProfileId: startup.id },
      create: { startupProfileId: startup.id, data, contentType, size: data.length },
      update: { data, contentType, size: data.length },
    });
    await this.prisma.startupProfile.update({
      where: { id: startup.id },
      data: { logoUrl },
    });
    return { logoUrl };
  }

  /** Take the signed-in startup's logo down, uploaded or linked. */
  async removeLogo(user: AuthUser) {
    if (user.role !== 'startup') {
      throw new ForbiddenException('Solo las empresas tienen logo');
    }
    const startup = await this.activeStartup(user.sub);
    if (startup) {
      await this.prisma.startupLogo.deleteMany({ where: { startupProfileId: startup.id } });
      await this.prisma.startupProfile.update({
        where: { id: startup.id },
        data: { logoUrl: null },
      });
    }
    return { logoUrl: null };
  }

  /**
   * The logo of an active company (see isAccountActive), for anyone to see, by the startup's
   * id. Links saved before an account could own several startups name the
   * account instead, and get its active startup's logo.
   */
  async logoOf(id: string): Promise<{ data: Buffer; contentType: ImageType }> {
    const logo = await this.prisma.startupLogo.findFirst({
      where: {
        startupProfile: { user: { verificationStatus: { in: ['approved', 'pending'] } } },
        OR: [
          { startupProfileId: id },
          { startupProfile: { activeFor: { some: { id } } } },
        ],
      },
    });
    const userId = id;
    // The logo of a startup still to claim its account from the test network.
    const data = logo
      ? Buffer.from(logo.data)
      : await this.prisma.migratedAccount
          .findFirst({
            where: { id: userId, role: 'startup', claimedById: null },
            select: { logo: true },
          })
          .then((waiting) => (waiting?.logo ? Buffer.from(waiting.logo) : null));
    // Checked again on the way out: only an image type is ever served.
    const contentType = data ? sniffImage(data) : null;
    if (!data || !contentType) throw new NotFoundException('No encontramos el logo');
    return { data, contentType };
  }

  /**
   * Public profile of an active user (see isAccountActive): a company or a
   * specialist who sent their account details. Everyone else stays hidden. A startup's own id
   * shows that startup, since one account can own several. An account that is
   * both a startup and a specialist shows the side the visitor asked for
   * (`as`), never both: the two are not tied together in public.
   */
  async publicProfile(id: string, as?: 'startup' | 'specialist') {
    if (as !== 'specialist') {
      const company = await this.publicStartup(id);
      if (company) return company;
    }
    const userId = id;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        startupProfile: true,
        specialistProfile: true,
        // The other half of IDENTITY_SELECT: the status comes with the user.
        _count: IDENTITY_SELECT._count,
      },
    });
    if (!user) return this.waitingPublicProfile(userId);
    if (!isAccountActive(user)) {
      throw new NotFoundException('No encontramos el perfil');
    }

    // The side asked for; without one, the side the account acts as now.
    const startupFirst = as ? as === 'startup' : user.role === 'startup';
    const profile = startupFirst
      ? (user.startupProfile ?? user.specialistProfile)
      : (user.specialistProfile ?? user.startupProfile);
    if (!profile) throw new NotFoundException('No encontramos el perfil');
    const isSpecialist = profile === user.specialistProfile;

    return {
      userId: user.id,
      ...(isSpecialist ? {} : { startupId: profile.id }),
      role: isSpecialist ? 'specialist' : 'startup',
      // Shortened: a public page must not tie a person's name to a wallet
      // anyone can read the balance and payments of. Left out for an account
      // that is a startup and a specialist: its two pages must not be tied.
      wallet:
        user.startupProfile && user.specialistProfile ? '' : shortWallet(user.stellarAddress),
      memberSince: user.createdAt,
      identityVerified: identityVerified(user),
      profile: isSpecialist ? publicSpecialist(profile) : profile,
    };
  }

  /** One startup's public page, by the startup's own id. */
  private async publicStartup(id: string) {
    const company = await this.prisma.startupProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            stellarAddress: true,
            createdAt: true,
            deletedAt: true,
            specialistProfile: { select: { id: true } },
            ...IDENTITY_SELECT,
          },
        },
      },
    });
    if (!company) return null;
    const { user, ...profile } = company;
    if (
      user.deletedAt ||
      !(['approved', 'pending'] as string[]).includes(user.verificationStatus)
    ) {
      throw new NotFoundException('No encontramos el perfil');
    }
    return {
      userId: user.id,
      startupId: profile.id,
      role: 'startup' as const,
      // Not shown for an account that is an expert too: the pages stay apart.
      wallet: user.specialistProfile ? '' : shortWallet(user.stellarAddress),
      memberSince: user.createdAt,
      identityVerified: identityVerified(user),
      profile,
    };
  }

  /**
   * The profile of an account moved from the test network and not claimed
   * yet: shown, but with no wallet, since it has none here until its owner
   * signs in.
   */
  private async waitingPublicProfile(id: string) {
    const row = await this.prisma.migratedAccount.findFirst({
      where: { id, claimedById: null },
      select: { id: true, role: true, profile: true, createdAt: true },
    });
    if (!row) throw new NotFoundException('No encontramos el perfil');
    return {
      userId: row.id,
      role: row.role,
      wallet: '',
      memberSince: row.createdAt,
      identityVerified: false,
      waiting: true,
      profile:
        row.role === 'specialist'
          ? publicSpecialist(waitingProfile(row, this.apiBase))
          : waitingProfile(row, this.apiBase),
    };
  }
}

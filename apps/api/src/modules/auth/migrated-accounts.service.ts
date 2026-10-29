import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type User } from '@prisma/client';
import { securityEvent } from '../../common/security/security-log';
import { PrismaService } from '../../prisma/prisma.service';
import { PollarWalletsService } from '../pollar/pollar-wallets.service';

/** What a new Pocket account takes from the Pollar session that claims it. */
export interface ClaimingSession {
  email?: string;
  stellarAddress: string;
  /** User fields from the Pollar session: id, custody, provider, email. */
  userFields: Omit<Prisma.UserCreateInput, 'stellarAddress' | 'role'>;
}

type VerificationSnapshot = Pick<
  Prisma.VerificationRequestUncheckedCreateInput,
  | 'fullName'
  | 'contactEmail'
  | 'country'
  | 'linkedinUrl'
  | 'websiteUrl'
  | 'companyName'
  | 'companyRegistrationId'
  | 'note'
>;

/**
 * Accounts approved on testnet and carried to mainnet. Pollar gives each
 * person a new wallet on mainnet, so the account cannot be matched by address:
 * it is matched by the email Pollar verified, once, on the first login, and
 * arrives approved with its profile, CV and logo.
 */
@Injectable()
export class MigratedAccountsService {
  private readonly logger = new Logger(MigratedAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly wallets: PollarWalletsService,
  ) {}

  /** The account waiting for this email, created for the session's wallet; null when none waits. */
  async claim(session: ClaimingSession): Promise<User | null> {
    const email = session.email?.trim().toLowerCase();
    if (!email) return null;
    const waiting = await this.prisma.migratedAccount.findUnique({ where: { email } });
    if (!waiting || waiting.claimedAt) return null;

    const user = await this.prisma.$transaction(async (tx) => {
      // Claimed first, so two logins at once cannot both take it.
      const taken = await tx.migratedAccount.updateMany({
        where: { id: waiting.id, claimedAt: null },
        data: { claimedAt: new Date() },
      });
      if (taken.count !== 1) return null;

      const created = await tx.user.create({
        data: {
          ...session.userFields,
          stellarAddress: session.stellarAddress,
          role: waiting.role,
          verificationStatus: 'approved',
        },
      });
      await tx.verificationRequest.create({
        data: {
          ...(waiting.verification as unknown as VerificationSnapshot),
          userId: created.id,
          status: 'approved',
          reviewedAt: new Date(),
          reviewNote: 'Aprobada en la red de pruebas de Pocket y trasladada a la red principal.',
        },
      });

      const base = this.config.get<string>('apiPublicUrl') ?? '';
      const profile = { ...(waiting.profile as Record<string, unknown>) };
      if (waiting.role === 'startup') {
        if (waiting.logo && waiting.logoContentType) {
          await tx.startupLogo.create({
            data: {
              userId: created.id,
              data: waiting.logo,
              contentType: waiting.logoContentType,
              size: waiting.logo.length,
            },
          });
          profile.logoUrl = `${base}/profiles/${created.id}/logo?v=${Date.now()}`;
        } else if (pointsToAnUploadedFile(profile.logoUrl)) {
          // A link to the testnet API's copy of a file that did not come along.
          profile.logoUrl = null;
        }
        await tx.startupProfile.create({
          data: { ...(profile as Prisma.StartupProfileUncheckedCreateInput), userId: created.id },
        });
      } else {
        if (waiting.cv) {
          await tx.specialistCv.create({
            data: { userId: created.id, data: waiting.cv, size: waiting.cv.length },
          });
          profile.cvUrl = `${base}/profiles/${created.id}/cv`;
        } else if (pointsToAnUploadedFile(profile.cvUrl)) {
          profile.cvUrl = null;
        }
        await tx.specialistProfile.create({
          data: {
            ...(profile as Prisma.SpecialistProfileUncheckedCreateInput),
            userId: created.id,
          },
        });
      }

      await tx.migratedAccount.update({
        where: { id: waiting.id },
        data: { claimedById: created.id },
      });
      return created;
    });
    if (!user) return null;

    securityEvent('migrated_account_claimed', { userId: user.id, role: user.role });
    // Approved accounts get their wallet's reserve, as a manager's approval does.
    await this.wallets.activate(user.id);
    this.logger.log(`Migrated ${user.role} account claimed by ${user.id}`);
    return user;
  }
}

/** A link to a CV or logo stored by a Pocket API, as opposed to an outside link. */
function pointsToAnUploadedFile(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  try {
    return /\/profiles\/[0-9a-f-]{36}\/(cv|logo)$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

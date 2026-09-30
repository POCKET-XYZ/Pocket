import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LEGAL_VERSION } from '@pocket/shared';
import { securityEvent } from '../../common/security/security-log';
import { PrismaService } from '../../prisma/prisma.service';
import { termsAccepted } from '../auth/auth.service';

/** Contracts that hold, or are about to hold, money in an escrow. */
const MONEY_IN_PLAY = ['awaiting_funding', 'active'] as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Record that the user accepted the current Terms and Privacy Policy. Only
   * the version in force can be accepted: an old one would prove nothing.
   */
  async acceptTerms(id: string, version: string, ip?: string) {
    if (version !== LEGAL_VERSION) {
      throw new BadRequestException('These are not the Terms in force. Reload the page');
    }
    return this.prisma.user.update({ where: { id }, data: termsAccepted(ip) });
  }

  /**
   * Everything Pocket holds about the user, in one document: the right of
   * access and of portability. The uploaded CV is listed, not embedded; it is
   * downloadable from the profile.
   */
  async exportData(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { tokenVersion: true },
      include: {
        verificationRequests: {
          omit: { reviewedById: true },
          orderBy: { submittedAt: 'asc' },
        },
        startupProfile: true,
        specialistProfile: true,
        cv: { select: { size: true, uploadedAt: true } },
        jobs: { include: { milestones: true } },
        applications: true,
        contractsAsStartup: { include: { milestones: { include: { deliverables: true } } } },
        contractsAsSpecialist: { include: { milestones: { include: { deliverables: true } } } },
        disputesOpened: true,
        disputeEvidence: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    securityEvent('data_exported', { userId: id });
    return {
      exportedAt: new Date().toISOString(),
      note:
        'Your wallet address and your escrow transactions are also on the public Stellar network, outside Pocket.',
      ...user,
    };
  }

  /**
   * Delete the account at the owner's request. Personal data is erased: the
   * profile, the CV, the verification requests, the email and the link to the
   * wallet. What stays is an anonymous row, so the contracts, payments and
   * disputes of the other party keep their history, as the law and those
   * users need. Not possible while money is in an escrow the user is part of:
   * that escrow needs both parties to end.
   */
  async deleteAccount(id: string): Promise<void> {
    const user = await this.findById(id);
    if (user.deletedAt) return;
    if (user.role === 'manager') {
      throw new ForbiddenException('Manager accounts are closed by the Pocket team');
    }

    const party = { OR: [{ startupId: id }, { specialistId: id }] };
    const [inPlay, beingAccepted] = await Promise.all([
      this.prisma.contract.count({ where: { ...party, status: { in: [...MONEY_IN_PLAY] } } }),
      this.prisma.contract.count({
        where: { ...party, status: 'awaiting_specialist', acceptedAt: { not: null } },
      }),
    ]);
    if (inPlay > 0 || beingAccepted > 0) {
      throw new ConflictException(
        'You have contracts with money in escrow. Finish or resolve them before deleting your account',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Offers still waiting for the specialist are withdrawn, and the jobs
      // they came from reopen for other applicants.
      const offers = await tx.contract.findMany({
        where: { ...party, status: 'awaiting_specialist', acceptedAt: null },
        select: { id: true, jobId: true, applicationId: true, startupId: true },
      });
      for (const offer of offers) {
        await tx.contract.update({
          where: { id: offer.id },
          data: { status: 'cancelled', cancelledAt: new Date() },
        });
        await tx.application.update({
          where: { id: offer.applicationId },
          data: { status: 'rejected', decidedAt: new Date() },
        });
        if (offer.startupId !== id) {
          await tx.job.update({ where: { id: offer.jobId }, data: { status: 'open' } });
        }
      }

      // A startup's open jobs close; a specialist's pending applications end.
      const openJobs = await tx.job.findMany({
        where: { startupId: id, status: { in: ['open', 'in_progress'] } },
        select: { id: true },
      });
      const jobIds = openJobs.map((job) => job.id);
      await tx.job.updateMany({ where: { id: { in: jobIds } }, data: { status: 'closed' } });
      await tx.application.updateMany({
        where: { jobId: { in: jobIds }, status: 'submitted' },
        data: { status: 'rejected', decidedAt: new Date() },
      });
      await tx.application.updateMany({
        where: { specialistId: id, status: 'submitted' },
        data: { status: 'withdrawn', decidedAt: new Date() },
      });

      await tx.specialistCv.deleteMany({ where: { userId: id } });
      await tx.specialistProfile.deleteMany({ where: { userId: id } });
      await tx.startupProfile.deleteMany({ where: { userId: id } });
      await tx.verificationRequest.deleteMany({ where: { userId: id } });

      await tx.user.update({
        where: { id },
        data: {
          // Frees the wallet: signing in with it again starts a new account.
          stellarAddress: `deleted:${id}`,
          email: null,
          pollarUserId: null,
          walletProvider: null,
          walletFundedAt: null,
          verificationStatus: 'not_submitted',
          deletedAt: new Date(),
          // Ends every session at once.
          tokenVersion: { increment: 1 },
        },
      });
    });
    securityEvent('account_deleted', { userId: id });
  }
}

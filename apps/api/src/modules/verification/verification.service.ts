import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type User, type VerificationRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PollarWalletsService } from '../pollar/pollar-wallets.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: PollarWalletsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Complete the account details. Nobody reviews them by hand: sending them
   * approves the account on the spot, and the approval is the business event
   * that activates a Pollar wallet, so the user finds it ready to receive USDC.
   * Allowed when the user has never sent them or was turned down before.
   */
  async submit(userId: string, dto: SubmitVerificationDto): Promise<VerificationRequest> {
    const user = await this.getUser(userId);

    if (user.role === 'manager') {
      throw new BadRequestException('Los managers no pasan por la verificación');
    }
    if (user.verificationStatus === 'approved') {
      throw new BadRequestException('Tu cuenta ya está verificada');
    }
    if (user.role === 'startup' && !dto.companyName) {
      throw new BadRequestException(
        'El nombre de la empresa es obligatorio para las startups',
      );
    }

    const request = await this.prisma.$transaction(async (tx) => {
      // Claim the user: of two submissions sent at once, the second finds the
      // account approved already.
      const claimed = await tx.user.updateMany({
        where: { id: userId, verificationStatus: { not: 'approved' } },
        data: { verificationStatus: 'approved' },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Tu cuenta ya está verificada');
      }
      const now = new Date();
      return tx.verificationRequest.create({
        data: {
          ...dto,
          userId,
          status: 'approved',
          submittedAt: now,
          reviewedAt: now,
        } satisfies Prisma.VerificationRequestUncheckedCreateInput,
      });
    });

    this.notifications.notifyEmail(request.contactEmail, { type: 'verification_approved' });
    await this.wallets.activate(userId);
    return request;
  }

  /** The user's latest request, or null when they never submitted one. */
  latestFor(userId: string): Promise<VerificationRequest | null> {
    return this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  private async getUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('No encontramos al usuario');
    return user;
  }
}

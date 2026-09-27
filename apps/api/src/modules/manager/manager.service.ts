import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { VerificationRequest, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PollarWalletsService } from '../pollar/pollar-wallets.service';

/** Verification queue operations. Only managers reach these. */
@Injectable()
export class ManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: PollarWalletsService,
  ) {}

  /** Review queue, oldest first so nobody waits forever. */
  list(status: VerificationStatus = 'pending') {
    return this.prisma.verificationRequest.findMany({
      where: { status },
      orderBy: { submittedAt: 'asc' },
      include: {
        user: { select: { id: true, role: true, stellarAddress: true, createdAt: true } },
      },
    });
  }

  /**
   * Approve a pending request: the user can operate on the marketplace. An
   * approval is also the business event that activates a Pollar wallet, so the
   * user finds it ready to receive USDC.
   */
  async approve(requestId: string, managerId: string, note?: string) {
    const reviewed = await this.decide(requestId, managerId, 'approved', note);
    await this.wallets.activate(reviewed.userId);
    return reviewed;
  }

  /** Reject a pending request. The note explains what to fix before resubmitting. */
  async reject(requestId: string, managerId: string, note?: string) {
    if (!note?.trim()) {
      throw new BadRequestException('A rejection must explain why');
    }
    return await this.decide(requestId, managerId, 'rejected', note);
  }

  private async decide(
    requestId: string,
    managerId: string,
    status: 'approved' | 'rejected',
    note?: string,
  ): Promise<VerificationRequest> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Verification request not found');
    if (request.status !== 'pending') {
      throw new BadRequestException('This request was already reviewed');
    }

    const [reviewed] = await this.prisma.$transaction([
      this.prisma.verificationRequest.update({
        where: { id: requestId },
        data: {
          status,
          reviewNote: note,
          reviewedById: managerId,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.user.update({
        where: { id: request.userId },
        data: { verificationStatus: status },
      }),
    ]);

    return reviewed;
  }
}

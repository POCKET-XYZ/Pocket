import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type User, type VerificationRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitVerificationDto } from './dto/submit-verification.dto';

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submit the account for review. Allowed when the user has never submitted
   * or was rejected, so a rejected user can fix their details and try again.
   * Approved users and users already waiting cannot submit again.
   */
  async submit(userId: string, dto: SubmitVerificationDto): Promise<VerificationRequest> {
    const user = await this.getUser(userId);

    if (user.role === 'manager') {
      throw new BadRequestException('Los managers no pasan por la verificación');
    }
    if (user.verificationStatus === 'pending') {
      throw new BadRequestException('Tu verificación ya está en revisión');
    }
    if (user.verificationStatus === 'approved') {
      throw new BadRequestException('Tu cuenta ya está verificada');
    }
    if (user.role === 'startup' && !dto.companyName) {
      throw new BadRequestException(
        'El nombre de la empresa es obligatorio para las startups',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Move the user to pending only from a state that allows it: of two
      // submissions sent at once, the second finds the user pending already.
      const claimed = await tx.user.updateMany({
        where: { id: userId, verificationStatus: { in: ['not_submitted', 'rejected'] } },
        data: { verificationStatus: 'pending' },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Tu verificación ya está en revisión');
      }
      return tx.verificationRequest.create({
        data: {
          ...dto,
          userId,
          status: 'pending',
        } satisfies Prisma.VerificationRequestUncheckedCreateInput,
      });
    });
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

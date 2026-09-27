import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PollarClient } from './pollar.client';

/**
 * Deferred funding. A Pollar wallet is created on-chain at login but without its
 * XLM reserve, and the reserve costs Pocket real XLM, so it is paid for when the
 * account becomes real to us: the moment a manager approves the verification.
 *
 * See https://docs.pollar.xyz/docs/guides/deferred-flow-guide.
 */
@Injectable()
export class PollarWalletsService {
  private readonly logger = new Logger(PollarWalletsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pollar: PollarClient,
  ) {}

  /**
   * Activate the user's wallet if it is a Pollar one that is still unfunded.
   * Returns whether the wallet ended up active. Never throws: a wallet that
   * cannot be funded right now must not block the decision a manager just took,
   * and the next login or approval tries again.
   */
  async activate(userId: string): Promise<boolean> {
    if (!this.pollar.enabled) return false;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.walletCustody !== 'pollar' || user.walletFundedAt) return false;

    try {
      const funding = await this.pollar.fundWallet(user.stellarAddress);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { walletFundedAt: new Date() },
      });
      this.logger.log(
        funding.alreadyFunded
          ? `Wallet ${user.stellarAddress} was already active`
          : `Funded wallet ${user.stellarAddress} with ${funding.startingBalance ?? '0'} XLM`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Could not fund ${user.stellarAddress}: ${(error as Error).message}`,
      );
      return false;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PollarClient } from './pollar.client';

/**
 * Deferred funding. A Pollar wallet is created at login without its XLM, and
 * Pocket pays it (from Pollar's funding wallet) as soon as the person is in:
 * on sign-up and on every sign-in until it is active, so the wallet is ready
 * before any contract needs it. Approving an account, accepting a contract and
 * funding one try again when Pollar could not fund it before.
 *
 * See https://docs.pollar.xyz/docs/guides/deferred-flow-guide.
 */
@Injectable()
export class PollarWalletsService {
  private readonly logger = new Logger(PollarWalletsService.name);
  /**
   * Activations under way, by user. A browser can sign in twice at once; the
   * second sign-in waits for the first activation instead of asking Pollar
   * again for a wallet that is already being funded.
   */
  private readonly running = new Map<string, Promise<boolean>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pollar: PollarClient,
  ) {}

  /**
   * Activate the user's wallet if it is a Pollar one that is still unfunded.
   * Returns whether the wallet ended up active. Never throws: a wallet that
   * cannot be funded right now must not block the approval, and the owner's
   * next sign-in tries again.
   */
  activate(userId: string): Promise<boolean> {
    const running = this.running.get(userId);
    if (running) return running;
    const activation = this.fund(userId).finally(() => this.running.delete(userId));
    this.running.set(userId, activation);
    return activation;
  }

  private async fund(userId: string): Promise<boolean> {
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

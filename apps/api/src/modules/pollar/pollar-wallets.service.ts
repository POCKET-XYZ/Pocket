import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PollarClient } from './pollar.client';

/** How often unfunded Pollar wallets are looked for and activated. */
const SWEEP_MS = 5 * 60_000;

/** Wallets one sweep activates at most, so a backlog never floods Pollar. */
const SWEEP_BATCH = 20;

/**
 * Deferred funding. A Pollar wallet is created at login without its XLM, and
 * Pocket pays it (from Pollar's funding wallet) as soon as Pollar confirms who
 * the person is, even before they finish creating their Pocket account, so
 * the wallet is ready long before any contract needs it.
 *
 * It must not depend on one call going through: each activation retries, every
 * sign-in tries again until the wallet is active, accepting a contract and
 * depositing try again, and a sweep every five minutes activates any Pollar
 * wallet still waiting, whether or not its owner comes back.
 *
 * See https://docs.pollar.xyz/docs/guides/deferred-flow-guide.
 */
@Injectable()
export class PollarWalletsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PollarWalletsService.name);
  /**
   * Activations under way, by address. A browser can sign in twice at once;
   * the second sign-in waits for the first activation instead of asking
   * Pollar again for a wallet that is already being funded.
   */
  private readonly running = new Map<string, Promise<boolean>>();
  private timer?: NodeJS.Timeout;

  /** Waits between attempts: Pollar has timed out once and answered the next call. */
  retryDelaysMs = [2_000, 5_000];

  constructor(
    private readonly prisma: PrismaService,
    private readonly pollar: PollarClient,
  ) {}

  onApplicationBootstrap(): void {
    // Background work stays off in tests and in local runs.
    if (process.env.NODE_ENV === 'test' || process.env.PLATFORM_MONITOR === 'off') return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
    void this.sweep();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * Activate the user's wallet if it is a Pollar one that is still unfunded.
   * Returns whether the wallet ended up active. Never throws: a wallet that
   * cannot be funded right now must not block anything, and the next try
   * comes soon.
   */
  async activate(userId: string): Promise<boolean> {
    if (!this.pollar.enabled) return false;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.walletCustody !== 'pollar' || user.walletFundedAt) return false;
    return this.activateAddress(user.stellarAddress);
  }

  /**
   * Activate a Pollar wallet by its address, before or after its Pocket
   * account exists. Every account on that address is marked as funded once it
   * is, so an account created meanwhile is not asked about again.
   */
  activateAddress(address: string): Promise<boolean> {
    if (!this.pollar.enabled) return Promise.resolve(false);
    const running = this.running.get(address);
    if (running) return running;
    const activation = this.fund(address).finally(() => this.running.delete(address));
    this.running.set(address, activation);
    return activation;
  }

  /** Activate the Pollar wallets still waiting, oldest first. */
  async sweep(): Promise<number> {
    if (!this.pollar.enabled) return 0;
    try {
      const waiting = await this.prisma.user.findMany({
        where: { walletCustody: 'pollar', walletFundedAt: null, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: SWEEP_BATCH,
        select: { stellarAddress: true },
      });
      let activated = 0;
      for (const user of waiting) {
        if (await this.activateAddress(user.stellarAddress)) activated++;
      }
      if (waiting.length > 0) {
        this.logger.log(`Sweep activated ${activated} of ${waiting.length} waiting wallets`);
      }
      return activated;
    } catch (error) {
      this.logger.warn(`Wallet sweep failed: ${(error as Error).message}`);
      return 0;
    }
  }

  private async fund(address: string): Promise<boolean> {
    const attempts = this.retryDelaysMs.length + 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const funding = await this.pollar.fundWallet(address);
        await this.prisma.user.updateMany({
          where: { stellarAddress: address, walletCustody: 'pollar', walletFundedAt: null },
          data: { walletFundedAt: new Date() },
        });
        this.logger.log(
          funding.alreadyFunded
            ? `Wallet ${address} was already active`
            : `Funded wallet ${address} with ${funding.startingBalance ?? '0'} XLM`,
        );
        return true;
      } catch (error) {
        const last = attempt === attempts;
        this.logger[last ? 'error' : 'warn'](
          `Could not fund ${address} (attempt ${attempt} of ${attempts}): ${(error as Error).message}`,
        );
        if (!last) await sleep(this.retryDelaysMs[attempt - 1]);
      }
    }
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

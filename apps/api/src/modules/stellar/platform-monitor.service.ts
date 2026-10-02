import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon } from '@stellar/stellar-sdk';
import { securityEvent } from '../../common/security/security-log';
import { PrismaService } from '../../prisma/prisma.service';
import { StellarService } from './stellar.service';

/** How often Horizon is asked for new operations of the platform account. */
const POLL_MS = 30_000;
/** The balance is checked every this many polls: about every ten minutes. */
const BALANCE_EVERY = 20;
/** A low balance is reported again after this long, not on every check. */
const REALERT_MS = 6 * 60 * 60 * 1000;
const PAGE = 200;

/**
 * Watches the platform account on chain. Every transaction it sends goes
 * through Pocket and is recorded in chain_operations first, so one that is not
 * there was signed somewhere else: the key leaked. That is an alert, at once.
 * It also warns before the account runs out of XLM for fees.
 */
@Injectable()
export class PlatformMonitorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PlatformMonitorService.name);
  protected horizon: Horizon.Server;
  private readonly minXlm: number;
  private cursor: string | null = null;
  private timer?: NodeJS.Timeout;
  private polls = 0;
  private lastLowBalanceAlert = 0;
  private lastTrustlineAlert = 0;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {
    this.horizon = new Horizon.Server(config.getOrThrow<string>('stellar.horizonUrl'));
    this.minXlm = config.get<number>('stellar.platformMinXlm') ?? 20;
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.PLATFORM_MONITOR === 'off') return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      await this.checkOperations();
      if (this.polls++ % BALANCE_EVERY === 0) await this.checkBalance();
    } catch (error) {
      this.logger.warn(`Could not check the platform account: ${String(error)}`);
    }
  }

  /**
   * Looks at the operations since the last check and alerts on each one the
   * platform account sent that Pocket did not record. The first call only
   * finds where the history ends today. Returns how many were unrecorded.
   */
  async checkOperations(): Promise<number> {
    const account = this.stellar.platformAddress;
    if (this.cursor === null) {
      const latest = await this.horizon
        .operations()
        .forAccount(account)
        .order('desc')
        .limit(1)
        .call();
      this.cursor = latest.records[0]?.paging_token ?? '0';
      return 0;
    }

    let unrecorded = 0;
    for (;;) {
      const page = await this.horizon
        .operations()
        .forAccount(account)
        .cursor(this.cursor)
        .order('asc')
        .limit(PAGE)
        .call();
      for (const operation of page.records) {
        this.cursor = operation.paging_token;
        // Payments others send to the account are not the key at work.
        if (operation.source_account !== account) continue;
        const known = await this.prisma.chainOperation.findUnique({
          where: { txHash: operation.transaction_hash },
          select: { id: true },
        });
        if (!known) {
          unrecorded++;
          securityEvent(
            'unrecorded_platform_operation',
            {
              account,
              txHash: operation.transaction_hash,
              type: operation.type,
              at: operation.created_at,
            },
            'alert',
          );
        }
      }
      if (page.records.length < PAGE) return unrecorded;
    }
  }

  /**
   * Alerts when the XLM left for fees falls under the threshold, and when the
   * account no longer trusts USDC. Pocket's fee is paid to this account in
   * USDC on every release and resolution, so without the trustline the
   * escrow cannot pay it and those steps fail.
   */
  async checkBalance(): Promise<number> {
    const account = await this.horizon.loadAccount(this.stellar.platformAddress);
    const xlm = Number(
      account.balances.find((balance) => balance.asset_type === 'native')?.balance ?? 0,
    );
    if (xlm < this.minXlm && Date.now() - this.lastLowBalanceAlert > REALERT_MS) {
      this.lastLowBalanceAlert = Date.now();
      securityEvent(
        'platform_balance_low',
        { account: this.stellar.platformAddress, xlm, threshold: this.minXlm },
        'alert',
      );
    }
    const trustsUsdc = account.balances.some(
      (balance) =>
        'asset_code' in balance &&
        balance.asset_code === 'USDC' &&
        balance.asset_issuer === this.stellar.usdcIssuer,
    );
    if (!trustsUsdc && Date.now() - this.lastTrustlineAlert > REALERT_MS) {
      this.lastTrustlineAlert = Date.now();
      securityEvent(
        'platform_usdc_trustline_missing',
        { account: this.stellar.platformAddress, issuer: this.stellar.usdcIssuer },
        'alert',
      );
    }
    return xlm;
  }
}

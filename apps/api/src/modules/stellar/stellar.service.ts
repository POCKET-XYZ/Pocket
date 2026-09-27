import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  Asset,
  BASE_FEE,
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Networks,
  NotFoundError,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

/** Whether an address can receive USDC. */
export type UsdcReadiness = 'ready' | 'no_account' | 'no_trustline';

/** How long a user has to sign a transaction Pocket prepared for them. */
const SIGNING_WINDOW_SECONDS = 300;

/** Network access shared by every on-chain operation. */
@Injectable()
export class StellarService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StellarService.name);
  readonly networkPassphrase: string;
  readonly usdc: Asset;
  readonly usdcIssuer: string;
  private readonly platform: Keypair;
  private readonly horizon: Horizon.Server;

  constructor(config: ConfigService) {
    this.networkPassphrase =
      config.get<string>('stellar.network') === 'mainnet'
        ? Networks.PUBLIC
        : Networks.TESTNET;
    this.usdcIssuer = config.getOrThrow<string>('stellar.usdcIssuer');
    this.usdc = new Asset('USDC', this.usdcIssuer);
    this.platform = Keypair.fromSecret(
      config.getOrThrow<string>('stellar.platformSecret'),
    );
    this.horizon = new Horizon.Server(config.getOrThrow<string>('stellar.horizonUrl'));
  }

  /**
   * Trustless Work refuses to deploy an escrow whose platform account does not
   * trust USDC, so say so at boot instead of on the first hire.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const readiness = await this.usdcReadiness(this.platformAddress);
      if (readiness !== 'ready') {
        this.logger.warn(
          `Platform account ${this.platformAddress} is not ready for USDC (${readiness}). Run: bun run stellar:setup`,
        );
      }
    } catch (error) {
      this.logger.warn(`Could not check the platform account: ${String(error)}`);
    }
  }

  /** Pocket's own account: escrow deployer, release signer and dispute resolver. */
  get platformAddress(): string {
    return this.platform.publicKey();
  }

  /** Transaction hash in hex. Signatures do not change it. */
  hashOf(xdr: string): string {
    const tx = TransactionBuilder.fromXDR(xdr, this.networkPassphrase);
    // A wallet that sponsors fees returns the signed transaction wrapped in a
    // fee bump. What identifies the operation is the transaction inside it,
    // which is the one Pocket prepared and hashed.
    const inner = tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
    const hash = inner.hash();
    return Buffer.from(hash).toString('hex');
  }

  /** Sign a transaction with the platform key and return the signed XDR. */
  signAsPlatform(xdr: string): string {
    const tx = TransactionBuilder.fromXDR(xdr, this.networkPassphrase);
    tx.sign(this.platform);
    return tx.toXDR();
  }

  /** Whether the account exists and holds a USDC trustline. */
  async usdcReadiness(address: string): Promise<UsdcReadiness> {
    try {
      const account = await this.horizon.loadAccount(address);
      const hasTrustline = account.balances.some(
        (balance) =>
          'asset_code' in balance &&
          balance.asset_code === this.usdc.getCode() &&
          balance.asset_issuer === this.usdcIssuer,
      );
      return hasTrustline ? 'ready' : 'no_trustline';
    } catch (error) {
      if (error instanceof NotFoundError) return 'no_account';
      throw error;
    }
  }

  /**
   * USDC the account can spend right now: its balance minus what is locked in
   * open DEX offers. Null when the account does not exist or does not trust
   * USDC. Returned as a string to keep the 7 decimals.
   */
  async spendableUsdc(address: string): Promise<string | null> {
    try {
      const account = await this.horizon.loadAccount(address);
      const line = account.balances.find(
        (balance) =>
          'asset_code' in balance &&
          balance.asset_code === this.usdc.getCode() &&
          balance.asset_issuer === this.usdcIssuer,
      );
      if (!line) return null;
      const locked = 'selling_liabilities' in line ? line.selling_liabilities : '0';
      return new Prisma.Decimal(line.balance).minus(locked).toFixed(7);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  /** Unsigned transaction that adds a USDC trustline to the given account. */
  async buildUsdcTrustline(address: string): Promise<string> {
    const account = await this.horizon.loadAccount(address);
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.changeTrust({ asset: this.usdc }))
      .setTimeout(SIGNING_WINDOW_SECONDS)
      .build()
      .toXDR();
  }

  /** Submit a signed classic transaction straight to Horizon. */
  async submitToHorizon(signedXdr: string): Promise<string> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    const result = await this.horizon.submitTransaction(tx);
    return result.hash;
  }
}

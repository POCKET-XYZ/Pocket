import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  Asset,
  BASE_FEE,
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Memo,
  Networks,
  NotFoundError,
  Operation,
  TransactionBuilder,
  type Transaction,
} from '@stellar/stellar-sdk';

import { securityEvent } from '../../common/security/security-log';
import { usdcPaymentsOf, type UsdcPaymentRecord } from './payment-history';
import { assertPlatformTx, type PlatformTxPolicy } from './platform-tx-policy';

/** Whether an address can receive USDC. */
export type UsdcReadiness = 'ready' | 'no_account' | 'no_trustline';

/**
 * Stellar's reserve per account entry, in XLM. A network parameter rather than
 * a constant of ours: it has changed before and could change again.
 */
const BASE_RESERVE_XLM = '0.5';

/** How long a user has to sign a transaction Pocket prepared for them. */
const SIGNING_WINDOW_SECONDS = 300;

/**
 * How many of the account's latest payment records are read to find its USDC
 * payments. Horizon's maximum page; older ones are left to the explorer.
 */
const PAYMENT_RECORDS_SCANNED = 200;

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

  /** A transaction of this network, unwrapped from a fee bump if it has one. */
  parse(xdr: string): Transaction {
    const tx = TransactionBuilder.fromXDR(xdr, this.networkPassphrase);
    return tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
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

  /**
   * Sign a transaction with the platform key and return the signed XDR, but
   * only when it is exactly what the policy allows. The key holds the platform
   * roles of every escrow, so it never signs a transaction blindly.
   */
  signAsPlatform(xdr: string, policy: PlatformTxPolicy): string {
    let tx: Transaction;
    try {
      tx = assertPlatformTx(xdr, this.networkPassphrase, this.platformAddress, policy);
    } catch (error) {
      // Trustless Work handed back something other than what Pocket asked
      // for: its API, the key or the connection may be compromised.
      securityEvent(
        'platform_refused',
        { contract: policy.contractId, fn: policy.fn, reason: (error as Error).message },
        'alert',
      );
      throw error;
    }
    tx.sign(this.platform);
    return tx.toXDR();
  }

  /** The Stellar Asset Contract that holds USDC in every escrow. */
  get usdcContractId(): string {
    return this.usdc.contractId(this.networkPassphrase);
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

  /**
   * XLM the account can spend, which is what pays the network fee of every
   * escrow step. Stellar locks part of the balance as the account's reserve,
   * and what is sponsored by somebody else does not count against it, so this
   * reads the reserve Horizon reports rather than assuming one.
   */
  async spendableXlm(address: string): Promise<string | null> {
    try {
      const account = await this.horizon.loadAccount(address);
      const native = account.balances.find((balance) => balance.asset_type === 'native');
      if (!native) return null;
      // Stellar's minimum balance, as the network computes it: two base
      // entries, plus every subentry, plus what this account sponsors for
      // others, minus what somebody else sponsors for it.
      const entries =
        2 +
        account.subentry_count +
        (account.num_sponsoring ?? 0) -
        (account.num_sponsored ?? 0);
      const reserve = new Prisma.Decimal(BASE_RESERVE_XLM).times(Math.max(entries, 0));
      const locked =
        'selling_liabilities' in native
          ? new Prisma.Decimal(native.selling_liabilities)
          : new Prisma.Decimal(0);
      const spendable = new Prisma.Decimal(native.balance).minus(reserve).minus(locked);
      return spendable.isNegative() ? '0' : spendable.toFixed(7);
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

  /**
   * Unsigned transaction that pays USDC from `source` to `destination`, with
   * an optional text memo. Nothing else: one payment operation.
   */
  async buildUsdcPayment(
    source: string,
    destination: string,
    amount: string,
    memo?: string,
  ): Promise<string> {
    const account = await this.horizon.loadAccount(source);
    const builder = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    }).addOperation(Operation.payment({ destination, asset: this.usdc, amount }));
    if (memo) builder.addMemo(Memo.text(memo));
    return builder.setTimeout(SIGNING_WINDOW_SECONDS).build().toXDR();
  }

  /**
   * The latest USDC that came into or left the account, newest first: plain
   * payments, path payments and escrow transfers. Empty when the account is
   * not on the network.
   */
  async usdcPayments(address: string, limit: number): Promise<UsdcPaymentRecord[]> {
    try {
      const page = await this.horizon
        .payments()
        .forAccount(address)
        .order('desc')
        .limit(PAYMENT_RECORDS_SCANNED)
        .call();
      return usdcPaymentsOf(page.records, address, this.usdc.getCode(), this.usdcIssuer).slice(
        0,
        limit,
      );
    } catch (error) {
      if (error instanceof NotFoundError) return [];
      throw error;
    }
  }

  /** Submit a signed classic transaction straight to Horizon. */
  async submitToHorizon(signedXdr: string): Promise<string> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    const result = await this.horizon.submitTransaction(tx);
    return result.hash;
  }
}

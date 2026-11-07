import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChainCheck, PublicStats } from '@pocket/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SorobanReader } from '../stellar/soroban-reader.service';
import { StellarService } from '../stellar/stellar.service';
import {
  chainCheckOf,
  tractionOf,
  type ContractOnRecord,
  type Credit,
  type EscrowOnChain,
} from './traction';

/** How long the public numbers are served before the chain is read again. */
export const STATS_TTL_MS = 5 * 60_000;
/** Escrows read from the network at the same time. */
const READS_AT_ONCE = 4;

interface Snapshot {
  contracts: ContractOnRecord[];
  escrows: EscrowOnChain[];
  credits: Credit[];
  platforms: Set<string>;
  at: Date;
}

/**
 * Pocket's traction read from Stellar: each escrow's state and balance from a
 * Soroban node, and the fee each one paid from the platform account's history
 * on Horizon. The database only says which escrows are Pocket's; every amount
 * comes from the chain, and the manager's check compares the two.
 */
@Injectable()
export class TractionService {
  private readonly logger = new Logger(TractionService.name);
  private cached: { stats: PublicStats; until: number } | null = null;
  private reading: Promise<PublicStats> | null = null;

  private readonly formerPlatforms: string[];

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly soroban: SorobanReader,
    private readonly stellar: StellarService,
  ) {
    this.formerPlatforms = config.get<string[]>('stellar.formerPlatformAddresses') ?? [];
  }

  /**
   * The public numbers, at most a few minutes old. When the chain cannot be
   * read, the last numbers read are served with the time they are from.
   */
  async publicStats(): Promise<PublicStats> {
    if (this.cached && Date.now() < this.cached.until) return this.cached.stats;
    this.reading ??= this.readStats().finally(() => {
      this.reading = null;
    });
    try {
      return await this.reading;
    } catch (error) {
      this.logger.warn(`Could not read Pocket's traction: ${String(error)}`);
      if (this.cached) return this.cached.stats;
      throw new ServiceUnavailableException(
        'No pudimos leer los números de la red. Prueba en unos minutos.',
      );
    }
  }

  /** The database against the chain, read now. */
  async chainCheck(): Promise<ChainCheck> {
    const snapshot = await this.snapshot();
    return chainCheckOf(
      snapshot.contracts,
      snapshot.escrows,
      snapshot.platforms,
      snapshot.credits,
      snapshot.at,
    );
  }

  private async readStats(): Promise<PublicStats> {
    const snapshot = await this.snapshot();
    const stats = tractionOf(snapshot.escrows, snapshot.platforms, snapshot.credits, {
      network: this.stellar.network === 'mainnet' ? 'mainnet' : 'testnet',
      platformAddress: this.stellar.platformAddress,
      now: snapshot.at,
    });
    this.cached = { stats, until: Date.now() + STATS_TTL_MS };
    return stats;
  }

  private async snapshot(): Promise<Snapshot> {
    const rows = await this.prisma.contract.findMany({
      where: { escrowId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        escrowId: true,
        status: true,
        amount: true,
        fundedAt: true,
        job: { select: { title: true } },
        milestones: {
          orderBy: { position: 'asc' },
          select: { position: true, amount: true, status: true },
        },
        chainOperations: {
          where: { status: 'confirmed', kind: { in: ['release', 'resolve'] } },
          select: {
            payouts: { where: { recipient: 'pocket' }, select: { amount: true } },
          },
        },
      },
    });
    const contracts: ContractOnRecord[] = rows.map((row) => ({
      id: row.id,
      escrowId: row.escrowId as string,
      jobTitle: row.job.title,
      status: row.status,
      amount: row.amount.toString(),
      funded: row.fundedAt !== null,
      milestones: row.milestones.map((milestone) => ({
        position: milestone.position,
        amount: milestone.amount.toString(),
        status: milestone.status,
      })),
      pocketFee: row.chainOperations
        .flatMap((operation) => operation.payouts)
        .reduce((total, payout) => total.plus(payout.amount), new Prisma.Decimal(0))
        .toString(),
    }));

    const escrows = await inBatches(
      [...new Set(contracts.map((contract) => contract.escrowId))],
      READS_AT_ONCE,
      async (escrowId): Promise<EscrowOnChain> => {
        const escrow = await this.soroban.escrow(escrowId);
        const balance = escrow ? await this.soroban.usdcBalance(escrowId) : 0n;
        return { escrowId, escrow, balance };
      },
    );

    const platforms = new Set([this.stellar.platformAddress, ...this.formerPlatforms]);
    const credits: Credit[] = [];
    for (const platform of platforms) {
      const received = await this.stellar.usdcReceived(platform);
      credits.push(
        ...received.map((payment) => ({
          from: payment.counterparty,
          to: platform,
          amount: payment.amount,
        })),
      );
    }
    return { contracts, escrows, credits, platforms, at: new Date() };
  }
}

/** Runs `work` over the items, `size` at a time, keeping their order. */
async function inBatches<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(work))));
  }
  return results;
}

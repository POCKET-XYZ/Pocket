import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AdminAccount,
  AdminContractCheck,
  AdminContractRow,
  AdminJobRow,
  AdminOverview,
  AdminUserRow,
} from '@pocket/shared';
import type { ContractStatus } from '@prisma/client';
import { Horizon, NotFoundError } from '@stellar/stellar-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { SorobanReader } from '../stellar/soroban-reader.service';
import { StellarService } from '../stellar/stellar.service';
import {
  ADMIN_CONTRACT_INCLUDE,
  attentionOf,
  contractCheckOf,
  contractRow,
  type PaymentOnChain,
} from './admin-rows';

const CONTRACT_STATUSES: ContractStatus[] = [
  'awaiting_specialist',
  'awaiting_funding',
  'active',
  'completed',
  'cancelled',
];

/**
 * The admin's view of Pocket: every contract, user and job, what needs a look,
 * Pocket's own accounts on chain, and each contract checked against Stellar.
 */
@Injectable()
export class AdminService {
  private readonly horizon: Horizon.Server;
  private readonly formerPlatforms: string[];
  private readonly platformMinXlm: number;
  private readonly funding: { address: string; minXlm: number };

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly soroban: SorobanReader,
    private readonly stellar: StellarService,
  ) {
    this.horizon = new Horizon.Server(config.getOrThrow<string>('stellar.horizonUrl'));
    this.formerPlatforms = config.get<string[]>('stellar.formerPlatformAddresses') ?? [];
    this.platformMinXlm = config.get<number>('stellar.platformMinXlm') ?? 20;
    this.funding = {
      address: config.get<string>('pollar.fundingAddress') ?? '',
      minXlm: config.get<number>('pollar.fundingMinXlm') ?? 10,
    };
  }

  async overview(): Promise<AdminOverview> {
    const now = new Date();
    const [sources, contractCounts, users, notApproved, jobsOpen, jobsTotal, accounts] =
      await Promise.all([
        this.prisma.contract.findMany({
          where: { status: { not: 'cancelled' } },
          include: ADMIN_CONTRACT_INCLUDE,
        }),
        this.prisma.contract.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.user.groupBy({
          by: ['role'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.user.count({
          where: {
            deletedAt: null,
            role: { not: 'manager' },
            verificationStatus: { not: 'approved' },
          },
        }),
        this.prisma.job.count({ where: { status: 'open' } }),
        this.prisma.job.count(),
        this.accounts(),
      ]);
    const byRole = (role: string) => users.find((u) => u.role === role)?._count._all ?? 0;
    return {
      generatedAt: now.toISOString(),
      network: this.stellar.network === 'mainnet' ? 'mainnet' : 'testnet',
      accounts,
      attention: attentionOf(sources, now),
      counts: {
        contracts: Object.fromEntries(
          CONTRACT_STATUSES.map((status) => [
            status,
            contractCounts.find((c) => c.status === status)?._count._all ?? 0,
          ]),
        ) as Record<ContractStatus, number>,
        users: {
          startups: byRole('startup'),
          specialists: byRole('specialist'),
          managers: byRole('manager'),
          notApproved,
        },
        jobs: { open: jobsOpen, total: jobsTotal },
      },
    };
  }

  async contracts(): Promise<AdminContractRow[]> {
    const now = new Date();
    const sources = await this.prisma.contract.findMany({
      include: ADMIN_CONTRACT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return sources.map((source) => contractRow(source, now));
  }

  /** One contract against its escrow on chain, read now. */
  async contractCheck(contractId: string): Promise<AdminContractCheck> {
    const source = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: ADMIN_CONTRACT_INCLUDE,
    });
    if (!source) throw new NotFoundException('No encontramos el contrato');
    const escrowId = source.escrowId;
    const onChain = escrowId
      ? await (async () => {
          const escrow = await this.soroban.escrow(escrowId);
          const balance = escrow ? await this.soroban.usdcBalance(escrowId) : 0n;
          return { escrow, balance };
        })()
      : null;
    const payments: PaymentOnChain[] = [];
    if (escrowId) {
      for (const op of source.chainOperations) {
        if (
          op.status !== 'confirmed' ||
          (op.kind !== 'release' && op.kind !== 'resolve')
        ) {
          continue;
        }
        try {
          const transfers = await this.stellar.usdcTransfersFrom(op.txHash, escrowId);
          payments.push({
            txHash: op.txHash,
            transfers: transfers.length ? transfers : null,
          });
        } catch {
          payments.push({ txHash: op.txHash, transfers: null });
        }
      }
    }
    const platforms = new Set([this.stellar.platformAddress, ...this.formerPlatforms]);
    return contractCheckOf(source, onChain, payments, platforms, new Date());
  }

  async users(): Promise<AdminUserRow[]> {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        email: true,
        verificationStatus: true,
        walletCustody: true,
        walletProvider: true,
        stellarAddress: true,
        createdAt: true,
        deletedAt: true,
        startupProfile: { select: { companyName: true } },
        specialistProfile: { select: { displayName: true } },
        verificationRequests: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
          select: { kycStatus: true, fullName: true },
        },
        _count: {
          select: {
            jobs: true,
            applications: true,
            contractsAsStartup: true,
            contractsAsSpecialist: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      name:
        row.startupProfile?.companyName ??
        row.specialistProfile?.displayName ??
        row.verificationRequests[0]?.fullName ??
        null,
      email: row.email,
      verificationStatus: row.verificationStatus,
      kycStatus: row.verificationRequests[0]?.kycStatus ?? null,
      walletCustody: row.walletCustody,
      walletProvider: row.walletProvider,
      stellarAddress: row.stellarAddress,
      createdAt: row.createdAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
      counts: {
        jobs: row._count.jobs,
        applications: row._count.applications,
        contracts: row._count.contractsAsStartup + row._count.contractsAsSpecialist,
      },
    }));
  }

  async jobs(): Promise<AdminJobRow[]> {
    const rows = await this.prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        budget: true,
        createdAt: true,
        startup: {
          select: { id: true, startupProfile: { select: { companyName: true } } },
        },
        applications: { select: { status: true } },
        contracts: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true },
        },
      },
    });
    return rows.map((row) => {
      const contract =
        row.contracts.find((c) => c.status !== 'cancelled') ?? row.contracts[0] ?? null;
      return {
        id: row.id,
        title: row.title,
        category: row.category,
        status: row.status,
        startup: {
          id: row.startup.id,
          name: row.startup.startupProfile?.companyName ?? null,
        },
        budget: row.budget.toString(),
        applications: {
          waiting: row.applications.filter((a) => a.status === 'submitted').length,
          total: row.applications.length,
        },
        contract,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  /** Pocket's account and Pollar's funding wallet, as the network has them now. */
  private async accounts(): Promise<AdminAccount[]> {
    const read = async (address: string) => {
      try {
        const account = await this.horizon.loadAccount(address);
        const xlm =
          account.balances.find((b) => b.asset_type === 'native')?.balance ?? '0';
        const trustsUsdc = account.balances.some(
          (b) =>
            'asset_code' in b &&
            b.asset_code === 'USDC' &&
            b.asset_issuer === this.stellar.usdcIssuer,
        );
        return { xlm, trustsUsdc };
      } catch (error) {
        if (error instanceof NotFoundError) return { xlm: '0', trustsUsdc: false };
        return { xlm: null, trustsUsdc: null };
      }
    };
    const platform = await read(this.stellar.platformAddress);
    const funding = this.funding.address ? await read(this.funding.address) : null;
    return [
      {
        role: 'platform',
        address: this.stellar.platformAddress,
        xlm: platform.xlm,
        minXlm: this.platformMinXlm,
        trustsUsdc: platform.trustsUsdc,
      },
      {
        role: 'funding',
        address: this.funding.address || null,
        xlm: funding?.xlm ?? null,
        minXlm: this.funding.minXlm,
        trustsUsdc: null,
      },
    ];
  }
}

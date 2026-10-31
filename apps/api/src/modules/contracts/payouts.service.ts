import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SorobanReader } from '../stellar/soroban-reader.service';
import { StellarService } from '../stellar/stellar.service';
import { TrustlessWorkClient } from '../stellar/trustless-work.client';
import { classifyPayouts } from './payouts';

/**
 * Stores what each release and dispute resolution paid, read from Stellar
 * rather than computed: the split between the specialist, the startup, Pocket
 * and Trustless Work that reports show. Read once per transaction.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly trustlessWork: TrustlessWorkClient,
    private readonly soroban: SorobanReader,
  ) {}

  /**
   * Read the split of every confirmed release and resolution of the contract
   * not read yet. Never throws: a transaction Horizon cannot give right now,
   * or has not indexed yet, is read the next time.
   */
  async readMissing(contractId: string): Promise<void> {
    // Callers run it in the background: an error here must never reach them.
    try {
      await this.read(contractId);
    } catch (error) {
      this.logger.warn(
        `Could not read the payouts of contract ${contractId}: ${(error as Error).message}`,
      );
    }
  }

  private async read(contractId: string): Promise<void> {
    const operations = await this.prisma.chainOperation.findMany({
      where: {
        contractId,
        kind: { in: ['release', 'resolve'] },
        status: 'confirmed',
        payoutsReadAt: null,
      },
      select: { id: true, txHash: true },
    });
    if (operations.length === 0) return;

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        escrowId: true,
        startup: { select: { stellarAddress: true } },
        specialist: { select: { stellarAddress: true } },
      },
    });
    if (!contract?.escrowId) return;
    const parties = {
      specialist: contract.specialist.stellarAddress,
      startup: contract.startup.stellarAddress,
      pocket: await this.feeAddressOf(contract.escrowId),
      trustlessWork: this.trustlessWork.feeAddress,
    };

    for (const operation of operations) {
      try {
        const transfers = await this.stellar.usdcTransfersFrom(
          operation.txHash,
          contract.escrowId,
        );
        // Every release and resolution moves USDC: nothing yet means Horizon
        // has not caught up, not that nothing was paid.
        if (transfers.length === 0) continue;
        const payouts = classifyPayouts(transfers, parties);
        await this.prisma.$transaction(async (tx) => {
          // Of two readers at once, only the one that claims it writes rows.
          const claimed = await tx.chainOperation.updateMany({
            where: { id: operation.id, payoutsReadAt: null },
            data: { payoutsReadAt: new Date() },
          });
          if (claimed.count !== 1) return;
          await tx.chainPayout.createMany({
            data: payouts.map((payout) => ({ ...payout, operationId: operation.id })),
          });
        });
        if (payouts.some((payout) => payout.recipient === 'other')) {
          this.logger.warn(
            `Transaction ${operation.txHash} paid an address outside the contract`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Could not read the payouts of ${operation.txHash}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Where the escrow pays Pocket's fee: the platform address it was deployed
   * with, which outlives a change of Pocket's key. The current one when the
   * escrow cannot be read.
   */
  private async feeAddressOf(escrowId: string): Promise<string> {
    try {
      const escrow = await this.soroban.escrow(escrowId);
      return escrow?.roles.platform ?? this.stellar.platformAddress;
    } catch {
      return this.stellar.platformAddress;
    }
  }
}

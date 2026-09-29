import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type ChainOperation, type ChainOperationKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PlatformTxPolicy } from './platform-tx-policy';
import { StellarService } from './stellar.service';
import { TrustlessWorkClient } from './trustless-work.client';

/** What an operation is about, so a signed transaction can only be used for it. */
export interface OperationScope {
  kind: ChainOperationKind;
  contractId?: string;
  milestoneId?: string;
}

/** A transaction a user has to sign, as the API hands it to the client. */
export interface PreparedTransaction {
  operationId: string;
  xdr: string;
  networkPassphrase: string;
}

@Injectable()
export class ChainOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly trustlessWork: TrustlessWorkClient,
  ) {}

  /** Record a transaction a user has to sign and return it for their wallet. */
  async prepare(
    scope: OperationScope,
    xdr: string,
    signerId: string,
    amount?: Prisma.Decimal.Value,
  ): Promise<PreparedTransaction> {
    const txHash = this.stellar.hashOf(xdr);
    let operation: ChainOperation;
    try {
      operation = await this.prisma.chainOperation.create({
        data: { ...scope, txHash, signerId, amount },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Trustless Work can build the very same transaction twice in a row (same
      // sequence and time bounds). Hand back the one already prepared for this
      // user and step; anything else with that hash is not theirs to reuse.
      const existing = await this.prisma.chainOperation.findUnique({ where: { txHash } });
      if (
        existing?.status !== 'prepared' ||
        existing.signerId !== signerId ||
        existing.kind !== scope.kind ||
        existing.contractId !== (scope.contractId ?? null) ||
        existing.milestoneId !== (scope.milestoneId ?? null)
      ) {
        throw new ConflictException('This transaction was already used. Try again');
      }
      operation = existing;
    }
    return {
      operationId: operation.id,
      xdr,
      networkPassphrase: this.stellar.networkPassphrase,
    };
  }

  /**
   * Broadcast a transaction a user signed. It is accepted only if Pocket
   * prepared exactly this transaction for this user and this purpose, and only
   * once: the row is claimed before anything is sent.
   */
  async submitSigned(
    scope: OperationScope,
    signedXdr: string,
    signerId: string,
  ): Promise<ChainOperation> {
    let txHash: string;
    try {
      txHash = this.stellar.hashOf(signedXdr);
    } catch {
      throw new BadRequestException('signedXdr is not a valid transaction');
    }

    const claimed = await claimStep(scope, () =>
      this.prisma.chainOperation.updateMany({
        where: {
          txHash,
          signerId,
          status: 'prepared',
          kind: scope.kind,
          contractId: scope.contractId ?? null,
          milestoneId: scope.milestoneId ?? null,
        },
        data: { status: 'confirmed', confirmedAt: new Date(), stepKey: stepKeyOf(scope) },
      }),
    );
    if (claimed.count !== 1) {
      throw new BadRequestException(
        'This transaction was not prepared for you, or it was already submitted',
      );
    }

    try {
      if (scope.kind === 'trustline') {
        await this.stellar.submitToHorizon(signedXdr);
      } else {
        await this.trustlessWork.send(signedXdr);
      }
    } catch (error) {
      await this.markFailed(txHash, error);
      throw error;
    }
    return this.prisma.chainOperation.findUniqueOrThrow({ where: { txHash } });
  }

  /**
   * Sign a transaction with the platform key, broadcast it and record it.
   * Used for the roles Pocket holds: deploy, release and dispute resolution.
   */
  async executeAsPlatform(
    scope: OperationScope,
    unsignedXdr: string,
    policy: PlatformTxPolicy,
    amount?: Prisma.Decimal.Value,
  ): Promise<{ operation: ChainOperation; contractId?: string }> {
    const signed = this.stellar.signAsPlatform(unsignedXdr, policy);
    // Claimed before sending, like user operations: a parallel request for the
    // same step fails here instead of reaching the network.
    const operation = await claimStep(scope, () =>
      this.prisma.chainOperation.create({
        data: {
          ...scope,
          txHash: this.stellar.hashOf(signed),
          amount,
          status: 'confirmed',
          confirmedAt: new Date(),
          stepKey: stepKeyOf(scope),
        },
      }),
    );

    try {
      const { contractId } = await this.trustlessWork.send(signed);
      const confirmed = await this.prisma.chainOperation.update({
        where: { id: operation.id },
        data: { confirmedAt: new Date() },
      });
      return { operation: confirmed, contractId };
    } catch (error) {
      await this.markFailed(operation.txHash, error);
      throw error;
    }
  }

  /**
   * Record that a sent operation did not have the expected effect, so its step
   * is free to be tried again.
   */
  async markFailed(txHash: string, error: unknown): Promise<void> {
    await this.prisma.chainOperation.update({
      where: { txHash },
      data: {
        status: 'failed',
        confirmedAt: null,
        stepKey: null,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * The key that makes an escrow step unique while it is confirmed. Deploy and
 * fund happen once per contract; the rest once per milestone. Trustlines are
 * per user and can be sent again, so they have none.
 */
export function stepKeyOf(scope: OperationScope): string | null {
  if (scope.kind === 'trustline') return null;
  const target =
    scope.kind === 'deploy' || scope.kind === 'fund'
      ? scope.contractId
      : scope.milestoneId;
  if (!target) {
    throw new Error(`A ${scope.kind} operation needs its contract or milestone`);
  }
  return `${scope.kind}:${target}`;
}

/** Run a claim and turn a clash on the step key into a clear conflict. */
async function claimStep<T>(scope: OperationScope, claim: () => Promise<T>): Promise<T> {
  try {
    return await claim();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictException(
        `This ${scope.kind} step was already sent. Refresh to see where it stands`,
      );
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

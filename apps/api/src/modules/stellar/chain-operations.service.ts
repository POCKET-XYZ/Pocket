import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type ChainOperation, type ChainOperationKind } from '@prisma/client';
import { securityEvent } from '../../common/security/security-log';
import { PrismaService } from '../../prisma/prisma.service';
import { timeBoundProblem, type PlatformTxPolicy } from './platform-tx-policy';
import { SorobanReader } from './soroban-reader.service';
import { StellarService } from './stellar.service';
import { TrustlessWorkClient } from './trustless-work.client';

/**
 * The transaction was sent but the chain has not shown it yet. It may still
 * land, so its step stays taken and nothing that depends on it is undone.
 */
export class NotYetConfirmed extends ServiceUnavailableException {
  constructor() {
    super('The network has not confirmed the transaction yet. Refresh in a minute');
  }
}

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
    private readonly chain: SorobanReader,
  ) {}

  /** Record a transaction a user has to sign and return it for their wallet. */
  async prepare(
    scope: OperationScope,
    xdr: string,
    signerId: string,
    amount?: Prisma.Decimal.Value,
  ): Promise<PreparedTransaction> {
    // Steps are freed for a retry once their transaction can no longer land,
    // which needs every transaction to expire soon.
    const expiry = timeBoundProblem(this.stellar.parse(xdr));
    if (expiry) {
      throw new ServiceUnavailableException(
        `Trustless Work built a transaction Pocket will not ask you to sign: ${expiry}. Try again`,
      );
    }
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

    const claimed = await this.claim(scope, () =>
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
        // Horizon answers once the transaction is in a ledger, or with its error.
        await this.stellar.submitToHorizon(signedXdr);
      } else {
        await this.trustlessWork.send(signedXdr);
        await this.confirmOnChain(txHash);
      }
    } catch (error) {
      // Not confirmed yet is not failed: the transaction may still land, so
      // its step stays taken. freeDeadStep frees it once it can no longer land.
      if (!(error instanceof NotYetConfirmed)) await this.markFailed(txHash, error);
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
    securityEvent('platform_signed', {
      kind: scope.kind,
      contractId: scope.contractId,
      milestoneId: scope.milestoneId,
      escrow: policy.contractId,
      fn: policy.fn,
      txHash: this.stellar.hashOf(signed),
    });
    // Claimed before sending, like user operations: a parallel request for the
    // same step fails here instead of reaching the network.
    const operation = await this.claim(scope, () =>
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
      await this.confirmOnChain(operation.txHash);
      const confirmed = await this.prisma.chainOperation.update({
        where: { id: operation.id },
        data: { confirmedAt: new Date() },
      });
      return { operation: confirmed, contractId };
    } catch (error) {
      if (!(error instanceof NotYetConfirmed)) {
        await this.markFailed(operation.txHash, error);
      }
      throw error;
    }
  }

  /**
   * Trustless Work answers as soon as the network takes a transaction, which is
   * not the same as it succeeding. Wait for the ledger's verdict: a failed
   * transaction moved nothing and frees its step; one that has not landed yet
   * keeps its step until it does or can no longer land.
   */
  private async confirmOnChain(txHash: string): Promise<void> {
    const status = await this.chain.waitForTransaction(txHash);
    if (status === 'FAILED') {
      throw new BadRequestException(
        'The transaction failed on the network, so nothing moved. Try again',
      );
    }
    if (status === 'NOT_FOUND') throw new NotYetConfirmed();
  }

  /**
   * Claim a step. When it is held by an earlier transaction that failed, or
   * that can no longer land, free it and claim again instead of leaving the
   * contract stuck on a step nobody can retry.
   */
  private async claim<T>(scope: OperationScope, claim: () => Promise<T>): Promise<T> {
    try {
      return await claimStep(scope, claim);
    } catch (error) {
      if (!(error instanceof ConflictException) || !(await this.freeDeadStep(scope))) {
        throw error;
      }
      return claimStep(scope, claim);
    }
  }

  private async freeDeadStep(scope: OperationScope): Promise<boolean> {
    const stepKey = stepKeyOf(scope);
    if (!stepKey) return false;
    const held = await this.prisma.chainOperation.findUnique({ where: { stepKey } });
    if (!held) return false;
    const age = Date.now() - held.createdAt.getTime();
    const status = await this.chain.transactionStatus(held.txHash);
    // FAILED is final. NOT_FOUND only means dead once the transaction's time
    // bound has passed, and while the node still keeps that day's history.
    const dead =
      status === 'FAILED' ||
      (status === 'NOT_FOUND' && age > DEAD_AFTER_MS && age < HISTORY_MS);
    if (!dead) return false;
    await this.markFailed(
      held.txHash,
      new Error(`The transaction ${status === 'FAILED' ? 'failed' : 'never landed'} on the network`),
    );
    return true;
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
        error: describe(error),
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

/**
 * Past this age a transaction nobody has seen cannot land any more: Pocket only
 * signs, and only prepares for users, transactions that expire within 15
 * minutes (see assertTimeBound).
 */
const DEAD_AFTER_MS = 16 * 60 * 1000;
/** How far back an RPC node is trusted to still know a transaction. */
const HISTORY_MS = 20 * 60 * 60 * 1000;

/** An error as the operation log keeps it, with the provider's own text. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error
    ? `${error.message} (${error.cause.message})`
    : error.message;
}

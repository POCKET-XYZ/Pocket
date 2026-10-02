import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ChainOperation, Contract, Milestone, Prisma } from '@prisma/client';
import {
  ChainOperationsService,
  type PreparedTransaction,
} from '../stellar/chain-operations.service';
import { securityEvent } from '../../common/security/security-log';
import { SorobanReader, type ChainMilestone } from '../stellar/soroban-reader.service';
import { toStroops } from '../stellar/platform-tx-policy';
import { StellarService } from '../stellar/stellar.service';
import { TrustlessWorkClient, type Distribution } from '../stellar/trustless-work.client';
import {
  deployPolicy,
  POCKET_PLATFORM_FEE_ON_CHAIN,
  releasePolicy,
  resolvePolicy,
  TW_API_PLATFORM_FEE,
  type PlatformAddresses,
} from './escrow-policies';

/** Trustless Work's text limits for an escrow, in characters. */
const LIMITS = { title: 100, description: 500, milestone: 500 } as const;

type Flag = 'approved' | 'released' | 'disputed' | 'resolved';

export interface DeployInput {
  contract: Pick<Contract, 'id'>;
  title: string;
  description: string;
  milestones: Pick<Milestone, 'position' | 'title' | 'amount'>[];
  startupAddress: string;
  specialistAddress: string;
}

/**
 * The escrow side of a contract. Each step builds the Trustless Work
 * transaction, has the right party sign it, and then reads the escrow back
 * from the chain: a step only counts once the chain shows it happened.
 *
 * Roles: the startup approves, the specialist is the service provider and
 * receives every milestone, and Pocket signs releases and resolves disputes.
 * Receivers are fixed at deploy time, so Pocket can decide when funds move but
 * never where they go outside the two parties.
 */
@Injectable()
export class EscrowService {
  constructor(
    private readonly stellar: StellarService,
    private readonly trustlessWork: TrustlessWorkClient,
    private readonly operations: ChainOperationsService,
    private readonly chain: SorobanReader,
  ) {}

  /** Deploy the contract's escrow. Returns its Soroban contract id. */
  async deploy(input: DeployInput): Promise<string> {
    const platform = this.stellar.platformAddress;
    const unsigned = await this.trustlessWork.deployMultiRelease({
      signer: platform,
      engagementId: input.contract.id,
      title: clip(input.title, LIMITS.title),
      description: clip(input.description, LIMITS.description),
      roles: {
        approver: input.startupAddress,
        serviceProvider: input.specialistAddress,
        platformAddress: platform,
        releaseSigner: platform,
        disputeResolver: platform,
      },
      // Pocket's 1%, which the escrow sends to the platform account on every
      // payout. The deploy policy checks the fee the transaction really sets.
      platformFee: TW_API_PLATFORM_FEE,
      milestones: [...input.milestones]
        .sort((a, b) => a.position - b.position)
        .map((milestone) => ({
          description: clip(milestone.title, LIMITS.milestone),
          amount: milestone.amount.toNumber(),
          receiver: input.specialistAddress,
        })),
      trustline: { address: this.stellar.usdcIssuer, symbol: 'USDC' },
    });

    const sorted = [...input.milestones].sort((a, b) => a.position - b.position);
    const amounts = sorted.map((milestone) => milestone.amount.toFixed(7));
    const policy = deployPolicy(this.platformAddresses(), {
      contractId: input.contract.id,
      startup: input.startupAddress,
      specialist: input.specialistAddress,
      milestoneAmounts: amounts,
    });
    const { operation, contractId: reported } = await this.operations.executeAsPlatform(
      { kind: 'deploy', contractId: input.contract.id },
      unsigned,
      policy,
    );
    // The address follows from the deployer and the salt of the transaction
    // the platform signed; Trustless Work's answer is only cross-checked.
    const escrowId = policy.escrowAddress();
    if (reported && reported !== escrowId) {
      securityEvent(
        'platform_refused',
        { contract: input.contract.id, reason: 'reported escrow address differs', reported, escrowId },
        'alert',
      );
    }

    let problem: string | null;
    try {
      problem = await this.deployedProblem(escrowId, input, amounts);
    } catch (error) {
      // Unverified is unusable: free the step so accepting again deploys anew.
      await this.operations.markFailed(operation.txHash, error);
      throw new ServiceUnavailableException(
        'Could not check the new escrow on chain. Accept again in a minute',
      );
    }
    if (problem) {
      securityEvent(
        'platform_refused',
        { contract: input.contract.id, escrowId, reason: problem },
        'alert',
      );
      const error = new ConflictException(
        'The escrow on chain is not the one Pocket asked for, so it will not be used',
      );
      await this.operations.markFailed(operation.txHash, error);
      throw error;
    }
    return escrowId;
  }

  /**
   * Reads the new escrow back from the chain: its code and everything the
   * deposit depends on. Null when it is exactly what Pocket asked for.
   */
  private async deployedProblem(
    escrowId: string,
    input: DeployInput,
    amounts: string[],
  ): Promise<string | null> {
    const [code, escrow] = await Promise.all([
      this.chain.wasmHash(escrowId),
      this.chain.escrow(escrowId),
    ]);
    if (code !== this.trustlessWork.escrowWasmHash) return 'the escrow runs other code';
    if (!escrow) return 'the escrow is not on chain';
    const platform = this.stellar.platformAddress;
    const { roles } = escrow;
    if (
      escrow.engagementId !== input.contract.id ||
      roles.approver !== input.startupAddress ||
      roles.service_provider !== input.specialistAddress ||
      roles.platform !== platform ||
      roles.release_signer !== platform ||
      roles.dispute_resolver !== platform
    ) {
      return 'the escrow has other roles';
    }
    if (escrow.trustline !== this.stellar.usdcContractId) {
      return 'the escrow holds another asset';
    }
    if (escrow.platformFee !== BigInt(POCKET_PLATFORM_FEE_ON_CHAIN)) {
      return `the escrow's platform fee is ${escrow.platformFee}, not Pocket's ${POCKET_PLATFORM_FEE_ON_CHAIN}`;
    }
    const milestonesMatch =
      escrow.milestones.length === amounts.length &&
      escrow.milestones.every(
        (milestone, index) =>
          milestone.receiver === input.specialistAddress &&
          milestone.amount === toStroops(amounts[index]),
      );
    return milestonesMatch ? null : 'the escrow has other milestones';
  }

  /** Funding transaction for the startup to sign. */
  async prepareFund(
    contract: Pick<Contract, 'id' | 'escrowId' | 'amount'>,
    startupId: string,
    startupAddress: string,
  ): Promise<PreparedTransaction> {
    const xdr = await this.trustlessWork.fund(
      escrowIdOf(contract),
      startupAddress,
      contract.amount.toNumber(),
    );
    return this.operations.prepare(
      { kind: 'fund', contractId: contract.id },
      xdr,
      startupId,
      contract.amount,
    );
  }

  /** Broadcast the startup's signed funding transaction. */
  submitFund(
    contractId: string,
    signedXdr: string,
    startupId: string,
  ): Promise<ChainOperation> {
    return this.operations.submitSigned(
      { kind: 'fund', contractId },
      signedXdr,
      startupId,
    );
  }

  /**
   * Whether the escrow holds at least the contract amount, asking the USDC
   * contract itself rather than anyone's report of it.
   */
  async isFunded(contract: Pick<Contract, 'escrowId' | 'amount'>): Promise<boolean> {
    const balance = await this.chain.usdcBalance(escrowIdOf(contract));
    return balance >= toStroops(contract.amount.toFixed(7));
  }

  /** Approval transaction for the startup to sign. */
  async prepareApprove(
    contract: Pick<Contract, 'id' | 'escrowId'>,
    milestone: Pick<Milestone, 'id' | 'position'>,
    startupId: string,
    startupAddress: string,
  ): Promise<PreparedTransaction> {
    const xdr = await this.trustlessWork.approve(
      escrowIdOf(contract),
      milestone.position,
      startupAddress,
    );
    return this.operations.prepare(
      { kind: 'approve', contractId: contract.id, milestoneId: milestone.id },
      xdr,
      startupId,
    );
  }

  submitApprove(
    contractId: string,
    milestoneId: string,
    signedXdr: string,
    startupId: string,
  ): Promise<ChainOperation> {
    return this.operations.submitSigned(
      { kind: 'approve', contractId, milestoneId },
      signedXdr,
      startupId,
    );
  }

  /** Release an approved milestone to the specialist, signed by Pocket. */
  async release(
    contract: Pick<Contract, 'id' | 'escrowId'>,
    milestone: Pick<Milestone, 'id' | 'position' | 'amount'>,
  ): Promise<ChainOperation> {
    const xdr = await this.trustlessWork.release(
      escrowIdOf(contract),
      milestone.position,
      this.stellar.platformAddress,
    );
    const { operation } = await this.operations.executeAsPlatform(
      { kind: 'release', contractId: contract.id, milestoneId: milestone.id },
      xdr,
      releasePolicy(this.platformAddresses(), escrowIdOf(contract), milestone.position),
      milestone.amount,
    );
    return operation;
  }

  /** Dispute transaction for the party opening it to sign. */
  async prepareDispute(
    contract: Pick<Contract, 'id' | 'escrowId'>,
    milestone: Pick<Milestone, 'id' | 'position'>,
    signerId: string,
    signerAddress: string,
  ): Promise<PreparedTransaction> {
    const xdr = await this.trustlessWork.dispute(
      escrowIdOf(contract),
      milestone.position,
      signerAddress,
    );
    return this.operations.prepare(
      { kind: 'dispute', contractId: contract.id, milestoneId: milestone.id },
      xdr,
      signerId,
    );
  }

  submitDispute(
    contractId: string,
    milestoneId: string,
    signedXdr: string,
    signerId: string,
  ): Promise<ChainOperation> {
    return this.operations.submitSigned(
      { kind: 'dispute', contractId, milestoneId },
      signedXdr,
      signerId,
    );
  }

  /** Execute a manager's decision on a disputed milestone, signed by Pocket. */
  async resolve(
    contract: Pick<Contract, 'id' | 'escrowId'>,
    milestone: Pick<Milestone, 'id' | 'position' | 'amount'>,
    shares: { address: string; amount: Prisma.Decimal }[],
  ): Promise<ChainOperation> {
    // Trustless Work rejects zero shares, so a side that gets nothing is left out.
    const distributions: Distribution[] = shares
      .filter((share) => share.amount.gt(0))
      .map((share) => ({ address: share.address, amount: share.amount.toNumber() }));
    const xdr = await this.trustlessWork.resolve(
      escrowIdOf(contract),
      milestone.position,
      this.stellar.platformAddress,
      distributions,
    );
    const { operation } = await this.operations.executeAsPlatform(
      { kind: 'resolve', contractId: contract.id, milestoneId: milestone.id },
      xdr,
      // Checked against the shares the manager decided, not against what came
      // back: the contract pays whoever the transaction names.
      resolvePolicy(
        this.platformAddresses(),
        escrowIdOf(contract),
        milestone.position,
        shares
          .filter((share) => share.amount.gt(0))
          .map((share) => ({ address: share.address, amount: share.amount.toFixed(7) })),
      ),
      milestone.amount,
    );
    return operation;
  }

  /** Whether the chain shows the given flag set on a milestone. */
  async milestoneHas(
    contract: Pick<Contract, 'escrowId'>,
    position: number,
    flag: Flag,
  ): Promise<boolean> {
    const milestone = await this.milestoneState(contract, position);
    return milestone?.flags[flag] === true;
  }

  /**
   * Forget an operation the escrow does not show. Trustless Work answers its
   * send endpoint as soon as the network takes the transaction, which is not
   * the same as the operation having happened, so a step that left no trace on
   * chain has to be freed or the user could never try it again.
   */
  async discard(txHash: string, reason: string): Promise<void> {
    await this.operations.markFailed(txHash, new Error(reason));
  }

  /** The addresses every platform signature is checked against. */
  private platformAddresses(): PlatformAddresses {
    return {
      platform: this.stellar.platformAddress,
      deployer: this.trustlessWork.deployerContractId,
      twFee: this.trustlessWork.feeAddress,
      usdcContract: this.stellar.usdcContractId,
      escrowWasmHash: this.trustlessWork.escrowWasmHash,
      networkPassphrase: this.stellar.networkPassphrase,
      network: this.stellar.network,
    };
  }

  /** Every flag of a milestone as the chain shows it now, in one read. */
  async milestoneFlags(
    contract: Pick<Contract, 'escrowId'>,
    position: number,
  ): Promise<Partial<Record<Flag, boolean>>> {
    const milestone = await this.milestoneState(contract, position);
    if (!milestone) throw new NotFoundException('The escrow has no such milestone');
    return milestone.flags;
  }

  /** A milestone as the escrow contract stores it, read from the chain. */
  private async milestoneState(
    contract: Pick<Contract, 'escrowId'>,
    position: number,
  ): Promise<ChainMilestone | undefined> {
    const escrow = await this.chain.escrow(escrowIdOf(contract));
    return escrow?.milestones[position];
  }
}

function escrowIdOf(contract: Pick<Contract, 'escrowId'>): string {
  if (!contract.escrowId) throw new NotFoundException('This contract has no escrow yet');
  return contract.escrowId;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

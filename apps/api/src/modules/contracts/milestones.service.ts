import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Contract, Deliverable, Milestone } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { PreparedTransaction } from '../stellar/chain-operations.service';
import { DeliverDto, RequestChangesDto } from './dto/milestone-actions.dto';
import { EscrowService } from './escrow.service';

type MilestoneWithContract = Milestone & { contract: Contract };

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escrow: EscrowService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The specialist submits the work for a milestone. Every version is kept. */
  async deliver(
    user: AuthUser,
    milestoneId: string,
    dto: DeliverDto,
  ): Promise<Deliverable> {
    const milestone = await this.load(milestoneId);
    if (milestone.contract.specialistId !== user.sub) {
      throw new ForbiddenException('Only the hired specialist delivers');
    }
    requireActive(milestone.contract);
    if (milestone.status !== 'pending' && milestone.status !== 'changes_requested') {
      throw new BadRequestException('This milestone is not waiting for a delivery');
    }

    const versions = await this.prisma.deliverable.count({ where: { milestoneId } });
    const [deliverable] = await this.prisma.$transaction([
      this.prisma.deliverable.create({
        data: { ...dto, milestoneId, version: versions + 1 },
      }),
      this.prisma.milestone.update({
        where: { id: milestoneId },
        data: { status: 'delivered' },
      }),
    ]);
    this.notifications.notifyUsers([milestone.contract.startupId], {
      type: 'milestone_delivered',
      contractId: milestone.contractId,
      milestoneTitle: milestone.title,
    });
    return deliverable;
  }

  /** The startup sends a delivery back with what to change. */
  async requestChanges(
    user: AuthUser,
    milestoneId: string,
    dto: RequestChangesDto,
  ): Promise<Milestone> {
    const milestone = await this.startupMilestone(user, milestoneId);
    if (milestone.status !== 'delivered') {
      throw new BadRequestException('Only a delivered milestone can be sent back');
    }
    // The price included a number of revision rounds. Past them the startup
    // approves or opens a dispute; it cannot hold the payment back forever.
    const { revisionRounds } = await this.prisma.job.findUniqueOrThrow({
      where: { id: milestone.contract.jobId },
      select: { revisionRounds: true },
    });
    if (milestone.revisionsUsed >= revisionRounds) {
      throw new BadRequestException(
        `The ${revisionRounds} revision round${revisionRounds === 1 ? '' : 's'} agreed are used. Approve the work or open a dispute`,
      );
    }
    const latest = await this.prisma.deliverable.findFirstOrThrow({
      where: { milestoneId },
      orderBy: { version: 'desc' },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      // Each round is counted, so both sides can see how many the price
      // included and how many are left. Claimed like any step: two requests
      // at once cannot spend two rounds on one delivery.
      const claimed = await tx.milestone.updateMany({
        where: { id: milestoneId, status: 'delivered', revisionsUsed: { lt: revisionRounds } },
        data: { status: 'changes_requested', revisionsUsed: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('This delivery was already answered. Refresh');
      }
      await tx.deliverable.update({
        where: { id: latest.id },
        data: { feedback: dto.feedback },
      });
      return tx.milestone.findUniqueOrThrow({ where: { id: milestoneId } });
    });
    this.notifications.notifyUsers([milestone.contract.specialistId], {
      type: 'changes_requested',
      contractId: milestone.contractId,
      milestoneTitle: milestone.title,
      feedback: dto.feedback,
    });
    return updated;
  }

  /** Approval transaction for the startup's wallet to sign. */
  async prepareApprove(
    user: AuthUser,
    milestoneId: string,
  ): Promise<PreparedTransaction> {
    const milestone = await this.startupMilestone(user, milestoneId);
    if (milestone.status !== 'delivered') {
      throw new BadRequestException('Only a delivered milestone can be approved');
    }
    await this.requireApprovableOnChain(milestone);
    return this.escrow.prepareApprove(
      milestone.contract,
      milestone,
      user.sub,
      user.stellarAddress,
    );
  }

  /**
   * Broadcast the startup's signed approval, confirm it on chain, then have
   * Pocket release the milestone to the specialist. The startup signs once.
   */
  async submitApprove(user: AuthUser, milestoneId: string, signedXdr: string) {
    const milestone = await this.startupMilestone(user, milestoneId);
    if (milestone.status !== 'delivered') {
      throw new BadRequestException('Only a delivered milestone can be approved');
    }
    // Checked again: the other party may have disputed it since it was prepared.
    await this.requireApprovableOnChain(milestone);
    const operation = await this.escrow.submitApprove(
      milestone.contractId,
      milestoneId,
      signedXdr,
      user.sub,
    );
    if (
      !(await this.escrow.milestoneHas(
        milestone.contract,
        milestone.position,
        'approved',
      ))
    ) {
      // Same as a dispute: the chain refuses a second approval, so freeing the
      // step is safe and is what lets the startup try again.
      await this.escrow.discard(
        operation.txHash,
        'The escrow does not show the milestone as approved',
      );
      throw new ConflictException(
        'The approval did not reach the escrow. Check your wallet and try again',
      );
    }
    await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: { status: 'approved', approvedAt: new Date() },
    });
    return this.release(milestoneId);
  }

  /**
   * Release an approved milestone. Runs right after approval; the startup or a
   * manager can call it again if that release failed.
   */
  async retryRelease(user: AuthUser, milestoneId: string) {
    const milestone = await this.load(milestoneId);
    if (user.role !== 'manager' && milestone.contract.startupId !== user.sub) {
      throw new ForbiddenException('Only the startup or a manager can release a payment');
    }
    // The approval may have landed on chain after submitApprove gave up waiting.
    if (
      milestone.status === 'delivered' &&
      (await this.escrow.milestoneHas(milestone.contract, milestone.position, 'approved'))
    ) {
      await this.prisma.milestone.update({
        where: { id: milestoneId },
        data: { status: 'approved', approvedAt: new Date() },
      });
    }
    return this.release(milestoneId);
  }

  private async release(milestoneId: string) {
    const milestone = await this.load(milestoneId);
    if (milestone.status !== 'approved') {
      throw new BadRequestException('Only an approved milestone can be paid');
    }

    // Skip the transaction if a previous attempt already landed on chain.
    const alreadyReleased = await this.escrow.milestoneHas(
      milestone.contract,
      milestone.position,
      'released',
    );
    if (!alreadyReleased) {
      await this.escrow.release(milestone.contract, milestone);
      if (
        !(await this.escrow.milestoneHas(
          milestone.contract,
          milestone.position,
          'released',
        ))
      ) {
        throw new ConflictException('The payment does not show on chain yet. Try again');
      }
    }

    const paid = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: { status: 'paid', paidAt: new Date() },
    });
    this.notifications.notifyUsers([milestone.contract.specialistId], {
      type: 'milestone_paid',
      contractId: milestone.contractId,
      milestoneTitle: milestone.title,
      amount: milestone.amount.toString(),
    });
    await this.completeIfDone(milestone.contractId);
    return paid;
  }

  /** A contract is complete once every milestone is paid or its dispute resolved. */
  async completeIfDone(contractId: string): Promise<void> {
    const open = await this.prisma.milestone.count({
      where: { contractId, status: { notIn: ['paid', 'resolved'] } },
    });
    if (open > 0) return;

    const contract = await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: 'completed', completedAt: new Date() },
    });
    await this.prisma.job.update({
      where: { id: contract.jobId },
      data: { status: 'completed' },
    });
  }

  /**
   * The V1 contract lets the approver approve a disputed milestone, but that
   * milestone can then only be settled by resolving the dispute, never
   * released. So the chain, not the database, decides whether an approval
   * makes sense. A milestone already approved or paid on chain (an approval
   * that landed after the request gave up waiting) is synced so its payment
   * can be released instead of being approved again.
   */
  private async requireApprovableOnChain(
    milestone: MilestoneWithContract,
  ): Promise<void> {
    const flags = await this.escrow.milestoneFlags(
      milestone.contract,
      milestone.position,
    );
    if (flags.disputed || flags.resolved) {
      throw new ConflictException(
        'This milestone is in dispute on the escrow, so it cannot be approved. A manager settles it',
      );
    }
    if (flags.approved || flags.released) {
      await this.prisma.milestone.update({
        where: { id: milestone.id },
        data: { status: 'approved', approvedAt: new Date() },
      });
      throw new ConflictException(
        'This milestone is already approved on the escrow. Release its payment instead',
      );
    }
  }

  async load(milestoneId: string): Promise<MilestoneWithContract> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { contract: true },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    return milestone;
  }

  private async startupMilestone(
    user: AuthUser,
    milestoneId: string,
  ): Promise<MilestoneWithContract> {
    const milestone = await this.load(milestoneId);
    if (milestone.contract.startupId !== user.sub) {
      throw new ForbiddenException('Only the startup that hired can do this');
    }
    requireActive(milestone.contract);
    return milestone;
  }
}

function requireActive(contract: Contract): void {
  if (contract.status !== 'active') {
    throw new BadRequestException('The escrow has to be funded first');
  }
}

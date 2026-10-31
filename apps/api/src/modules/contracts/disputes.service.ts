import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type DisputeStatus, type DisputeEvidence } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotYetConfirmed,
  stepKeyOf,
  type PreparedTransaction,
} from '../stellar/chain-operations.service';
import { AddEvidenceDto, OpenDisputeDto, ResolveDisputeDto } from './dto/dispute.dto';
import { DELIVERABLE_REPORT } from './deliverable-report';
import { EscrowService } from './escrow.service';
import { PayoutsService } from './payouts.service';
import { MilestonesService } from './milestones.service';

/** A milestone can be disputed while the work is under way or delivered. */
const DISPUTABLE = ['pending', 'delivered', 'changes_requested'] as const;

/** Reason on record for a dispute found on chain that nobody explained yet. */
const LANDED_REASON = 'Se abrió en el contrato, pero el motivo no quedó registrado. Agrégalo como evidencia';

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escrow: EscrowService,
    private readonly milestones: MilestonesService,
    private readonly notifications: NotificationsService,
    private readonly payouts: PayoutsService,
  ) {}

  /** Dispute transaction for the party opening it to sign. */
  async prepareOpen(user: AuthUser, milestoneId: string): Promise<PreparedTransaction> {
    const milestone = await this.disputableMilestone(user, milestoneId);
    if (await this.syncLandedDispute(user, milestone, LANDED_REASON)) {
      throw new ConflictException('Esta disputa ya llegó al contrato y está abierta');
    }
    return this.escrow.prepareDispute(
      milestone.contract,
      milestone,
      user.sub,
      user.stellarAddress,
    );
  }

  /**
   * Broadcast the signed dispute. The milestone's funds freeze on chain until a
   * manager decides.
   */
  async open(user: AuthUser, milestoneId: string, dto: OpenDisputeDto) {
    const milestone = await this.disputableMilestone(user, milestoneId);
    const landed = await this.syncLandedDispute(user, milestone, dto.reason);
    if (landed) return landed;
    const operation = await this.escrow.submitDispute(
      milestone.contractId,
      milestoneId,
      dto.signedXdr,
      user.sub,
    );
    if (
      !(await this.escrow.milestoneHas(
        milestone.contract,
        milestone.position,
        'disputed',
      ))
    ) {
      // The escrow refuses a second dispute on its own, so freeing the step
      // cannot open two, and without freeing it the milestone could never be
      // disputed again.
      await this.escrow.discard(
        operation.txHash,
        'The escrow does not show the milestone as disputed',
      );
      throw new ConflictException(
        'La disputa no llegó al contrato. Revisa tu wallet e intenta de nuevo',
      );
    }

    const [dispute] = await this.prisma.$transaction([
      this.prisma.dispute.create({
        data: { milestoneId, openedById: user.sub, reason: dto.reason },
      }),
      this.prisma.milestone.update({
        where: { id: milestoneId },
        data: { status: 'disputed' },
      }),
    ]);
    this.notifyOpened(milestone, dispute.id, user.sub);
    return dispute;
  }

  /** The party who did not open the dispute hears about it. */
  private notifyOpened(
    milestone: { title: string; contract: { startupId: string; specialistId: string } },
    disputeId: string,
    openedById: string,
  ): void {
    const { startupId, specialistId } = milestone.contract;
    const other = openedById === startupId ? specialistId : startupId;
    this.notifications.notifyUsers([other], {
      type: 'dispute_opened',
      disputeId,
      milestoneTitle: milestone.title,
    });
  }

  /** Either party, or a manager, adds a link or a comment to an open dispute. */
  async addEvidence(
    user: AuthUser,
    disputeId: string,
    dto: AddEvidenceDto,
  ): Promise<DisputeEvidence> {
    const dispute = await this.load(disputeId);
    assertParticipant(user, dispute.milestone.contract);
    if (dispute.status !== 'open') {
      throw new BadRequestException('Esta disputa ya está resuelta');
    }
    return this.prisma.disputeEvidence.create({
      data: { ...dto, disputeId, authorId: user.sub },
    });
  }

  /** Disputes for managers, oldest first so nobody waits forever. */
  list(status: DisputeStatus = 'open') {
    return this.prisma.dispute.findMany({
      where: { status },
      take: 200,
      orderBy: { createdAt: 'asc' },
      include: {
        milestone: {
          select: {
            id: true,
            title: true,
            amount: true,
            contract: { select: { id: true, job: { select: { title: true } } } },
          },
        },
      },
    });
  }

  async detail(user: AuthUser, disputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        milestone: {
          include: {
            contract: {
              select: {
                id: true,
                startupId: true,
                specialistId: true,
                job: { select: { kpis: { orderBy: { position: 'asc' } } } },
              },
            },
            deliverables: { orderBy: { version: 'asc' }, include: DELIVERABLE_REPORT },
          },
        },
        evidence: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, role: true } } },
        },
      },
    });
    if (!dispute) throw new NotFoundException('No encontramos la disputa');
    assertParticipant(user, dispute.milestone.contract);
    return dispute;
  }

  /**
   * A manager decides: everything to the specialist, everything back to the
   * startup, or a split. Pocket executes it on the escrow, which can only pay
   * the two parties.
   */
  async resolve(manager: AuthUser, disputeId: string, dto: ResolveDisputeDto) {
    const dispute = await this.load(disputeId);
    if (dispute.status !== 'open') {
      throw new BadRequestException('Esta disputa ya está resuelta');
    }
    const { milestone } = dispute;
    const { specialistAmount, startupAmount } = splitFor(dto, milestone.amount);

    // Record the decision before anything is sent, and only once: a retry, or
    // a second manager at the same moment, executes this decision or is told
    // another one is under way, and the record always matches what was paid.
    const decided = await this.prisma.dispute.updateMany({
      where: { id: disputeId, status: 'open', outcome: null },
      data: {
        outcome: dto.outcome,
        specialistAmount,
        startupAmount,
        resolutionNote: dto.note,
        resolvedById: manager.sub,
      },
    });
    if (decided.count !== 1) {
      const current = await this.prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } });
      const same =
        current.outcome === dto.outcome &&
        current.specialistAmount?.equals(specialistAmount) === true &&
        current.startupAmount?.equals(startupAmount) === true;
      if (current.status !== 'open') {
        throw new BadRequestException('Esta disputa ya está resuelta');
      }
      if (!same) {
        throw new ConflictException(
          'Se está ejecutando otra decisión sobre esta disputa. Actualiza la página para verla',
        );
      }
    }

    const parties = await this.prisma.contract.findUniqueOrThrow({
      where: { id: milestone.contractId },
      select: {
        startup: { select: { stellarAddress: true } },
        specialist: { select: { stellarAddress: true } },
      },
    });

    const alreadyResolved = await this.escrow.milestoneHas(
      milestone.contract,
      milestone.position,
      'resolved',
    );
    if (!alreadyResolved) {
      try {
        await this.escrow.resolve(milestone.contract, milestone, [
          { address: parties.specialist.stellarAddress, amount: specialistAmount },
          { address: parties.startup.stellarAddress, amount: startupAmount },
        ]);
      } catch (error) {
        // Nothing moved, unless the transaction may still land: then the
        // decision stays, so nobody can record a different one meanwhile.
        if (!(error instanceof NotYetConfirmed)) {
          await this.prisma.dispute.updateMany({
            where: { id: disputeId, status: 'open' },
            data: {
              outcome: null,
              specialistAmount: null,
              startupAmount: null,
              resolutionNote: null,
              resolvedById: null,
            },
          });
        }
        throw error;
      }
      if (
        !(await this.escrow.milestoneHas(
          milestone.contract,
          milestone.position,
          'resolved',
        ))
      ) {
        throw new ConflictException(
          'La resolución todavía no aparece en Stellar. Intenta de nuevo',
        );
      }
    }

    const [resolved] = await this.prisma.$transaction([
      this.prisma.dispute.update({
        where: { id: disputeId },
        // The decision recorded above; only its execution is new.
        data: { status: 'resolved', resolvedAt: new Date() },
      }),
      this.prisma.milestone.update({
        where: { id: milestone.id },
        data: { status: 'resolved' },
      }),
    ]);
    this.notifications.notifyUsers(
      [milestone.contract.startupId, milestone.contract.specialistId],
      {
        type: 'dispute_resolved',
        disputeId,
        milestoneTitle: milestone.title,
        specialistAmount: specialistAmount.toString(),
        startupAmount: startupAmount.toString(),
      },
    );
    // What the resolution split into, for the report; never holds it up.
    void this.payouts.readMissing(milestone.contractId);
    await this.milestones.completeIfDone(milestone.contractId);
    return resolved;
  }

  /**
   * A dispute can land on chain after the request that sent it gave up
   * waiting. The escrow then refuses a new one while Pocket shows none, and
   * the funds would stay frozen with nothing for a manager to resolve. Record
   * it now. Returns the dispute when there was one to record.
   */
  private async syncLandedDispute(
    user: AuthUser,
    milestone: {
      id: string;
      title: string;
      position: number;
      contract: { escrowId: string | null; startupId: string; specialistId: string };
    },
    reason: string,
  ) {
    const flags = await this.escrow.milestoneFlags(milestone.contract, milestone.position);
    if (!flags.disputed) return null;
    const stepKey = stepKeyOf({ kind: 'dispute', milestoneId: milestone.id });
    const sent = stepKey
      ? await this.prisma.chainOperation.findUnique({ where: { stepKey } })
      : null;
    const openedById = sent?.signerId ?? user.sub;
    const [dispute] = await this.prisma.$transaction([
      this.prisma.dispute.create({
        data: { milestoneId: milestone.id, openedById, reason },
      }),
      this.prisma.milestone.update({
        where: { id: milestone.id },
        data: { status: 'disputed' },
      }),
    ]);
    this.notifyOpened(milestone, dispute.id, openedById);
    return dispute;
  }

  private async disputableMilestone(user: AuthUser, milestoneId: string) {
    const milestone = await this.milestones.load(milestoneId);
    const { contract } = milestone;
    if (contract.startupId !== user.sub && contract.specialistId !== user.sub) {
      throw new ForbiddenException('Solo las dos partes pueden abrir una disputa');
    }
    if (contract.status !== 'active') {
      throw new BadRequestException('Solo se puede abrir una disputa en un contrato con el pago depositado');
    }
    if (!(DISPUTABLE as readonly string[]).includes(milestone.status)) {
      throw new BadRequestException('Ya no se puede abrir una disputa sobre este hito');
    }
    return milestone;
  }

  private async load(disputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { milestone: { include: { contract: true } } },
    });
    if (!dispute) throw new NotFoundException('No encontramos la disputa');
    return dispute;
  }
}

/** How much of the milestone each side receives. */
export function splitFor(
  dto: Pick<ResolveDisputeDto, 'outcome' | 'specialistAmount'>,
  total: Prisma.Decimal,
): { specialistAmount: Prisma.Decimal; startupAmount: Prisma.Decimal } {
  const zero = new Prisma.Decimal(0);
  if (dto.outcome === 'pay_specialist')
    return { specialistAmount: total, startupAmount: zero };
  if (dto.outcome === 'refund_startup')
    return { specialistAmount: zero, startupAmount: total };

  const specialistAmount = new Prisma.Decimal(dto.specialistAmount ?? 0);
  if (specialistAmount.lte(0) || specialistAmount.gte(total)) {
    throw new BadRequestException(
      `Al repartir, cada parte recibe una porción de los ${total.toString()} USDC. Para darle todo a una sola parte, elige Pagar al experto o Reembolsar a la startup`,
    );
  }
  return { specialistAmount, startupAmount: total.minus(specialistAmount) };
}

function assertParticipant(
  user: AuthUser,
  contract: { startupId: string; specialistId: string },
): void {
  if (
    user.role !== 'manager' &&
    contract.startupId !== user.sub &&
    contract.specialistId !== user.sub
  ) {
    throw new ForbiddenException('No eres parte de esta disputa');
  }
}

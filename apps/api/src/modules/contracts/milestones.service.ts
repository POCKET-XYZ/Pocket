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
import { DeliverDto, KpiResultDto, RequestChangesDto } from './dto/milestone-actions.dto';
import { EscrowService } from './escrow.service';
import { PayoutsService } from './payouts.service';

type MilestoneWithContract = Milestone & { contract: Contract };

/** What a KPI result says when the specialist could not measure it yet. */
export const NOT_MEASURABLE = 'Todavía no se puede medir';

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escrow: EscrowService,
    private readonly notifications: NotificationsService,
    private readonly payouts: PayoutsService,
  ) {}

  /** The specialist submits the work for a milestone. Every version is kept. */
  async deliver(
    user: AuthUser,
    milestoneId: string,
    dto: DeliverDto,
  ): Promise<Deliverable> {
    const milestone = await this.load(milestoneId);
    if (milestone.contract.specialistId !== user.sub) {
      throw new ForbiddenException('Solo el experto contratado puede entregar');
    }
    requireActive(milestone.contract);
    if (milestone.status !== 'pending' && milestone.status !== 'changes_requested') {
      throw new BadRequestException('Este hito no está esperando una entrega');
    }

    const { results, ...delivery } = dto;
    const report = await this.kpiReport(milestone.contract.jobId, results ?? []);

    const versions = await this.prisma.deliverable.count({ where: { milestoneId } });
    const [deliverable] = await this.prisma.$transaction([
      this.prisma.deliverable.create({
        data: {
          ...delivery,
          milestoneId,
          version: versions + 1,
          ...(report.length > 0 ? { kpiResults: { create: report } } : {}),
        },
        include: { kpiResults: true },
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
      throw new BadRequestException('Solo puedes pedir cambios en un hito entregado');
    }
    // The price included a number of revision rounds. Past them the startup
    // approves or opens a dispute; it cannot hold the payment back forever.
    const { revisionRounds } = await this.prisma.job.findUniqueOrThrow({
      where: { id: milestone.contract.jobId },
      select: { revisionRounds: true },
    });
    if (milestone.revisionsUsed >= revisionRounds) {
      throw new BadRequestException(
        `${revisionRounds === 1 ? 'Ya se usó la ronda de cambios acordada' : `Ya se usaron las ${revisionRounds} rondas de cambios acordadas`}. Aprueba el trabajo o abre una disputa`,
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
        throw new ConflictException('Esta entrega ya tiene respuesta. Actualiza la página');
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
      throw new BadRequestException('Solo se puede aprobar un hito entregado');
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
      throw new BadRequestException('Solo se puede aprobar un hito entregado');
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
        'La aprobación no llegó al contrato. Revisa tu wallet e intenta de nuevo',
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
      throw new ForbiddenException('Solo la startup o un manager pueden liberar un pago');
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
      throw new BadRequestException('Solo se puede pagar un hito aprobado');
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
        throw new ConflictException('El pago todavía no aparece en Stellar. Intenta de nuevo');
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
    // What the payment split into, for the report. In the background: it never
    // holds up the payment, and the report reads what is missing.
    void this.payouts.readMissing(milestone.contractId);
    await this.completeIfDone(milestone.contractId);
    return paid;
  }

  /**
   * A contract is complete once every milestone is paid or its dispute
   * resolved. Both parties are told their results report is ready, once.
   */
  async completeIfDone(contractId: string): Promise<void> {
    const open = await this.prisma.milestone.count({
      where: { contractId, status: { notIn: ['paid', 'resolved'] } },
    });
    if (open > 0) return;

    const completed = await this.prisma.contract.updateMany({
      where: { id: contractId, status: { not: 'completed' } },
      data: { status: 'completed', completedAt: new Date() },
    });
    if (completed.count !== 1) return;
    const contract = await this.prisma.contract.findUniqueOrThrow({
      where: { id: contractId },
      select: { jobId: true, startupId: true, specialistId: true },
    });
    const job = await this.prisma.job.update({
      where: { id: contract.jobId },
      data: { status: 'completed' },
      select: { title: true },
    });
    this.notifications.notifyUsers([contract.startupId, contract.specialistId], {
      type: 'report_ready',
      contractId,
      jobTitle: job.title,
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
        'Este hito está en disputa en el contrato, así que no se puede aprobar. Lo resuelve un manager',
      );
    }
    if (flags.approved || flags.released) {
      await this.prisma.milestone.update({
        where: { id: milestone.id },
        data: { status: 'approved', approvedAt: new Date() },
      });
      throw new ConflictException(
        'Este hito ya está aprobado en el contrato. Lo que sigue es liberar su pago',
      );
    }
  }

  /**
   * The results a delivery reports, checked against the job's KPIs: one for
   * each KPI the job has, none for a KPI it does not. A job without KPIs takes
   * no report. Returned in the order the startup listed the KPIs.
   */
  private async kpiReport(
    jobId: string,
    results: KpiResultDto[],
  ): Promise<
    { kpiId: string; value: string; numericValue?: number; comment?: string }[]
  > {
    const kpis = await this.prisma.jobKpi.findMany({
      where: { jobId },
      orderBy: { position: 'asc' },
      select: { id: true, name: true, targetValue: true },
    });
    if (kpis.length === 0) {
      if (results.length > 0) {
        throw new BadRequestException('Este trabajo no tiene KPI sobre los que reportar resultados');
      }
      return [];
    }

    const byKpi = new Map<string, KpiResultDto>();
    for (const result of results) {
      if (!kpis.some((kpi) => kpi.id === result.kpiId)) {
        throw new BadRequestException('Hay un resultado para un KPI que este trabajo no tiene');
      }
      if (byKpi.has(result.kpiId)) {
        throw new BadRequestException('Reporta un solo resultado por KPI');
      }
      byKpi.set(result.kpiId, result);
    }

    return kpis.map((kpi) => {
      const result = byKpi.get(kpi.id);
      const comment = result?.comment?.trim();
      const withComment = comment ? { comment } : {};
      if (result?.number !== undefined && result.notMeasurable) {
        throw new BadRequestException(
          `En "${kpi.name}", indica un número o que todavía no se puede medir, no las dos cosas`,
        );
      }

      // A numeric target is compared with a number, so it takes nothing else.
      if (kpi.targetValue !== null) {
        if (result?.number !== undefined) {
          return {
            kpiId: kpi.id,
            value: String(result.number),
            numericValue: result.number,
            ...withComment,
          };
        }
        if (result?.notMeasurable) {
          return { kpiId: kpi.id, value: NOT_MEASURABLE, ...withComment };
        }
        throw new BadRequestException(
          `Reporta un número para "${kpi.name}". Si todavía no se puede medir, indícalo`,
        );
      }

      const value =
        result?.value?.trim() ||
        (result?.number !== undefined ? String(result.number) : '') ||
        (result?.notMeasurable ? NOT_MEASURABLE : '');
      if (!value) {
        throw new BadRequestException(
          `Reporta un resultado para "${kpi.name}". Si todavía no se puede medir, indícalo`,
        );
      }
      return { kpiId: kpi.id, value, ...withComment };
    });
  }

  async load(milestoneId: string): Promise<MilestoneWithContract> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { contract: true },
    });
    if (!milestone) throw new NotFoundException('No encontramos el hito');
    return milestone;
  }

  private async startupMilestone(
    user: AuthUser,
    milestoneId: string,
  ): Promise<MilestoneWithContract> {
    const milestone = await this.load(milestoneId);
    if (milestone.contract.startupId !== user.sub) {
      throw new ForbiddenException('Solo la startup que contrató puede hacer esto');
    }
    requireActive(milestone.contract);
    return milestone;
  }
}

function requireActive(contract: Contract): void {
  if (contract.status !== 'active') {
    throw new BadRequestException('Primero hay que depositar el pago en el contrato');
  }
}

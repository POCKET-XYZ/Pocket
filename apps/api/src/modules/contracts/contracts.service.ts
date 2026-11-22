import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorCode } from '@pocket/shared';
import {
  Prisma,
  type Contract,
  type ContractStatus,
  type MilestoneStatus,
} from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import type { PreparedTransaction } from '../stellar/chain-operations.service';
import { StellarService } from '../stellar/stellar.service';
import { JobsService } from '../jobs/jobs.service';
import { REPORT_TEMPLATE_INFO } from '../jobs/report-template-info';
import { NotificationsService } from '../notifications/notifications.service';
import { PollarWalletsService } from '../pollar/pollar-wallets.service';
import { contactEmails } from '../users/contact-emails';
import { CreateContractDto, MilestoneInputDto } from './dto/create-contract.dto';
import { UpdateDetailsDto, UpdateTermsDto } from './dto/update-terms.dto';
import { DELIVERABLE_REPORT } from './deliverable-report';
import { POCKET_PLATFORM_FEE_ON_CHAIN } from './escrow-policies';
import { EscrowService } from './escrow.service';
import { JOB_COMPANY, jobsOfActiveStartup } from '../profiles/active-startup';

const DETAIL_INCLUDE = {
  job: {
    select: {
      id: true,
      title: true,
      category: true,
      deadline: true,
      status: true,
      revisionRounds: true,
      startupProfile: JOB_COMPANY,
      kpis: { orderBy: { position: 'asc' } },
      reportTemplate: { select: REPORT_TEMPLATE_INFO },
    },
  },
  // What the specialist asked for, to tell a counteroffer apart.
  application: { select: { price: true } },
  startup: {
    select: {
      id: true,
      stellarAddress: true,
      startupProfile: { select: { companyName: true, logoUrl: true } },
    },
  },
  specialist: {
    select: {
      id: true,
      stellarAddress: true,
      specialistProfile: { select: { displayName: true, avatarUrl: true } },
    },
  },
  milestones: {
    orderBy: { position: 'asc' },
    include: {
      deliverables: { orderBy: { version: 'asc' }, include: DELIVERABLE_REPORT },
      disputes: { orderBy: { createdAt: 'asc' } },
    },
  },
  chainOperations: {
    // Not the deploy of an escrow left behind when the terms went back to the
    // specialist: its step was freed, and it is not this contract's escrow.
    where: {
      status: 'confirmed',
      OR: [{ kind: { not: 'deploy' } }, { stepKey: { not: null } }],
    },
    orderBy: { confirmedAt: 'asc' },
    select: {
      id: true,
      kind: true,
      txHash: true,
      amount: true,
      milestoneId: true,
      confirmedAt: true,
    },
  },
} satisfies Prisma.ContractInclude;

/** Milestones whose details can still change: not delivered, paid or disputed. */
const EDITABLE_MILESTONE: MilestoneStatus[] = ['pending', 'changes_requested'];

/** One detail the startup changed after acceptance, as the specialist reads it. */
export interface MilestoneChange {
  position: number;
  title: string;
  field: 'dueDate' | 'description' | 'acceptanceCriteria';
  before: string | null;
  after: string | null;
  at: string;
}

/**
 * Changes not seen yet plus the new ones. A field changed twice keeps its
 * first value and its last; one changed back to where it was drops out.
 */
export function mergeChanges(
  seen: MilestoneChange[],
  added: MilestoneChange[],
): MilestoneChange[] {
  const merged = [...seen];
  for (const change of added) {
    const index = merged.findIndex(
      (each) => each.position === change.position && each.field === change.field,
    );
    if (index === -1) {
      merged.push(change);
      continue;
    }
    const first = merged[index];
    if (first.before === change.after) merged.splice(index, 1);
    else merged[index] = { ...change, before: first.before };
  }
  return merged.sort((a, b) => a.position - b.position);
}

const TERMS_CHANGED =
  'La startup cambió los términos mientras los revisabas. Revisa los nuevos antes de aceptar';

/**
 * Milestones the startup sends: none due in the past, and adding up exactly to
 * the price offered.
 */
function assertTermsAddUp(milestones: MilestoneInputDto[], price: Prisma.Decimal): void {
  const today = new Date().toISOString().slice(0, 10);
  if (milestones.some((milestone) => milestone.dueDate < today)) {
    throw new BadRequestException(
      'La fecha de entrega de un hito no puede estar en el pasado',
    );
  }
  const total = milestones.reduce(
    (sum, milestone) => sum.plus(milestone.amount),
    new Prisma.Decimal(0),
  );
  if (!total.equals(price)) {
    throw new BadRequestException(
      `Los hitos suman ${total.toString()} USDC, pero el precio que ofreces es ${price.toString()} USDC`,
    );
  }
}

/** Once the hire is final, the parties see each other's contact email. */
const CONTACT_STATUSES: ContractStatus[] = ['awaiting_funding', 'active', 'completed'];

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly escrow: EscrowService,
    private readonly stellar: StellarService,
    private readonly notifications: NotificationsService,
    private readonly wallets: PollarWalletsService,
  ) {}

  /**
   * The startup chooses an applicant and splits a price into milestones: the
   * one the applicant asked for or its own counteroffer, which the applicant
   * accepts or declines like any terms. The job stops taking applications;
   * the other applicants stay on hold until the specialist accepts, so the
   * startup can pick someone else if they decline.
   */
  async create(user: AuthUser, dto: CreateContractDto): Promise<Contract> {
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
    });
    if (!application) throw new NotFoundException('No encontramos la postulación');
    const jobId = application.jobId;
    const job = await this.jobs.ownedJob(user, jobId);
    if (job.status !== 'open') {
      throw new BadRequestException('Este trabajo no está abierto para contratar');
    }
    if (application.status !== 'submitted') {
      throw new BadRequestException('Esta postulación ya no está disponible');
    }

    await this.assertDifferentPeople(user.sub, application.specialistId);

    const price =
      dto.price === undefined ? application.price : new Prisma.Decimal(dto.price);
    assertTermsAddUp(dto.milestones, price);

    const created = await this.prisma.$transaction(async (tx) => {
      // Claim the job and the application together: of two offers sent at
      // once for the same job, only one finds it still open.
      const job = await tx.job.updateMany({
        where: { id: jobId, status: 'open' },
        data: { status: 'in_progress' },
      });
      const chosen = await tx.application.updateMany({
        where: { id: application.id, status: 'submitted' },
        data: { status: 'accepted', decidedAt: new Date() },
      });
      if (job.count !== 1 || chosen.count !== 1) {
        throw new ConflictException(
          'El trabajo o la postulación cambió mientras tanto. Actualiza la página',
        );
      }
      return tx.contract.create({
        data: {
          jobId,
          applicationId: application.id,
          startupId: user.sub,
          specialistId: application.specialistId,
          amount: price,
          milestones: {
            create: dto.milestones.map((milestone, position) => ({
              ...milestone,
              position,
              dueDate: new Date(milestone.dueDate),
            })),
          },
        },
        include: { milestones: { orderBy: { position: 'asc' } } },
      });
    });
    this.notifications.notifyUsers([created.specialistId], {
      type: 'offer_received',
      contractId: created.id,
      jobTitle: job.title,
      // A price other than theirs is told in the email itself.
      ...(price.equals(application.price)
        ? {}
        : {
            counteroffer: {
              offered: price.toString(),
              asked: application.price.toString(),
            },
          }),
    });
    return created;
  }

  /** Contracts the signed-in user is a party to, newest first. */
  mine(user: AuthUser) {
    return this.prisma.contract.findMany({
      where:
        user.role === 'startup'
          ? { startupId: user.sub, job: jobsOfActiveStartup(user.sub) }
          : { specialistId: user.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        job: { select: { id: true, title: true, category: true } },
        milestones: {
          orderBy: { position: 'asc' },
          select: { id: true, position: true, title: true, amount: true, status: true },
        },
      },
    });
  }

  /**
   * Full contract for its two parties and for managers. Once the specialist
   * has accepted, each party can see the other's contact email, since they
   * talk outside the platform. Not before: an offer alone must not be a way
   * to collect people's emails.
   */
  async detail(user: AuthUser, contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: DETAIL_INCLUDE,
    });
    if (!contract) throw new NotFoundException('No encontramos el contrato');
    assertCanView(user, contract);

    const hired = CONTACT_STATUSES.includes(contract.status);
    const contacts = hired
      ? await this.contactEmails([contract.startupId, contract.specialistId])
      : new Map<string, string>();
    const { job, startup, ...rest } = contract;
    const { startupProfile, ...jobFields } = job;
    return {
      ...rest,
      job: jobFields,
      // The startup the job is for: one account can own several.
      startup: { ...startup, startupProfile: startupProfile ?? startup.startupProfile },
      startupProfileId: startupProfile?.id ?? null,
      contacts: {
        startup: contacts.get(contract.startupId) ?? null,
        specialist: contacts.get(contract.specialistId) ?? null,
      },
    };
  }

  /**
   * The specialist turns the terms down. The contract is cancelled and the job
   * opens again, so the startup can choose another applicant.
   */
  async decline(user: AuthUser, contractId: string): Promise<Contract> {
    const contract = await this.specialistContract(user, contractId);
    if (contract.status !== 'awaiting_specialist') {
      throw new BadRequestException(
        'Solo puedes rechazar términos que todavía esperan tu respuesta',
      );
    }

    const declined = await this.prisma.$transaction(async (tx) => {
      // Not while an accept is deploying the escrow: that would reopen the
      // job under a contract about to hold money.
      const claimed = await tx.contract.updateMany({
        where: { id: contractId, status: 'awaiting_specialist', acceptedAt: null },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Estos términos ya se están aceptando');
      }
      // The specialist chose to step out: their application is withdrawn,
      // not rejected by the startup.
      await tx.application.update({
        where: { id: contract.applicationId },
        data: { status: 'withdrawn', decidedAt: new Date() },
      });
      await tx.job.update({ where: { id: contract.jobId }, data: { status: 'open' } });
      return tx.contract.findUniqueOrThrow({ where: { id: contractId } });
    });
    this.notifications.notifyUsers([contract.startupId], {
      type: 'offer_declined',
      contractId,
      jobTitle: await this.jobTitle(contract.jobId),
    });
    return declined;
  }

  /**
   * The startup takes back terms the specialist has not accepted yet, to fix
   * them or to choose someone else. Nothing was on chain, so the offer is
   * removed, the application waits again and the job opens again.
   */
  async withdrawOffer(user: AuthUser, contractId: string): Promise<{ jobId: string }> {
    const contract = await this.startupContract(user, contractId);
    if (contract.status !== 'awaiting_specialist') {
      throw new BadRequestException(
        'Solo puedes retirar términos que el experto todavía no aceptó',
      );
    }

    const withdrawn = await this.prisma.$transaction(async (tx) => {
      // Not while an accept is deploying the escrow.
      const removed = await tx.contract.deleteMany({
        where: { id: contractId, status: 'awaiting_specialist', acceptedAt: null },
      });
      if (removed.count !== 1) {
        throw new ConflictException(
          'El experto está aceptando estos términos en este momento',
        );
      }
      await tx.application.update({
        where: { id: contract.applicationId },
        data: { status: 'submitted', decidedAt: null },
      });
      await tx.job.update({ where: { id: contract.jobId }, data: { status: 'open' } });
      return { jobId: contract.jobId };
    });
    this.notifications.notifyUsers([contract.specialistId], {
      type: 'offer_withdrawn',
      jobTitle: await this.jobTitle(contract.jobId),
    });
    return withdrawn;
  }

  /**
   * The startup changes the price and the milestones as a whole.
   *
   * - Before the specialist accepts, nothing is on chain: the terms are
   *   replaced and the specialist is emailed. An accept sent for the old terms
   *   is refused (see accept's termsVersion).
   * - Accepted but not funded, the escrow exists and is empty. A change to
   *   what it holds (price, amounts, milestone names) sends the terms back to
   *   the specialist, who accepts again and gets a new escrow; the empty one
   *   is left unused. Anything else is a change of details (updateDetails).
   * - Once funded, only the details change.
   */
  async updateTerms(
    user: AuthUser,
    contractId: string,
    dto: UpdateTermsDto,
  ): Promise<Contract> {
    const contract = await this.startupContract(user, contractId);
    if (contract.status !== 'awaiting_specialist' && contract.status !== 'awaiting_funding') {
      throw new BadRequestException(
        contract.status === 'active'
          ? 'El pago ya está depositado: solo puedes cambiar fechas, descripciones y criterios de los hitos que faltan entregar'
          : 'Este contrato ya no se puede editar',
      );
    }
    const price = new Prisma.Decimal(dto.price);
    assertTermsAddUp(dto.milestones, price);

    if (contract.status === 'awaiting_funding') {
      const current = await this.prisma.milestone.findMany({
        where: { contractId },
        orderBy: { position: 'asc' },
      });
      const escrowChanged =
        !price.equals(contract.amount) ||
        dto.milestones.length !== current.length ||
        dto.milestones.some(
          (milestone, index) =>
            !new Prisma.Decimal(milestone.amount).equals(current[index].amount) ||
            milestone.title !== current[index].title,
        );
      if (!escrowChanged) {
        return this.updateDetails(user, contractId, {
          milestones: dto.milestones.map((milestone, position) => ({
            position,
            dueDate: milestone.dueDate,
            description: milestone.description,
            acceptanceCriteria: milestone.acceptanceCriteria,
          })),
        });
      }
      await this.assertEscrowUntouched(contract);
    }

    const accepted = contract.status === 'awaiting_funding';
    const updated = await this.prisma.$transaction(async (tx) => {
      // Claim the contract in the state it was read in: not while an accept
      // is deploying the escrow with the milestones it already read, and not
      // once a deposit landed. Changing it also moves updatedAt, the version
      // an accept has to match.
      const claimed = await tx.contract.updateMany({
        where: accepted
          ? { id: contractId, status: 'awaiting_funding', fundedAt: null }
          : { id: contractId, status: 'awaiting_specialist', acceptedAt: null },
        data: {
          amount: price,
          // Back to the specialist, who accepts again and gets a new escrow.
          ...(accepted
            ? {
                status: 'awaiting_specialist',
                acceptedAt: null,
                escrowId: null,
                platformFeeBps: 0,
                pendingChanges: Prisma.DbNull,
              }
            : {}),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          accepted
            ? 'El contrato cambió mientras tanto. Actualiza la página'
            : 'El experto está aceptando estos términos en este momento',
        );
      }
      if (accepted) {
        // The empty escrow's deploy stays on record; its step is free, so
        // accepting again deploys a new escrow for the new terms.
        await tx.chainOperation.updateMany({
          where: { stepKey: `deploy:${contractId}` },
          data: { stepKey: null },
        });
      }
      // Before the deposit a milestone has no delivery, dispute or payment.
      await tx.milestone.deleteMany({ where: { contractId } });
      await tx.milestone.createMany({
        data: dto.milestones.map((milestone, position) => ({
          ...milestone,
          contractId,
          position,
          dueDate: new Date(milestone.dueDate),
        })),
      });
      return tx.contract.findUniqueOrThrow({
        where: { id: contractId },
        include: { milestones: { orderBy: { position: 'asc' } } },
      });
    });
    this.notifications.notifyUsers([contract.specialistId], {
      type: 'offer_updated',
      contractId,
      jobTitle: await this.jobTitle(contract.jobId),
    });
    return updated;
  }

  /**
   * The startup changes dates, descriptions or criteria of milestones not
   * delivered yet, once the specialist accepted. None of it is in the escrow,
   * which stays as it is. Once the deposit is in, a date only moves later, so
   * a change never leaves the specialist late. The specialist sees what
   * changed the next time they open the contract (pendingChanges), with no
   * email and nothing to accept.
   */
  async updateDetails(
    user: AuthUser,
    contractId: string,
    dto: UpdateDetailsDto,
  ): Promise<Contract> {
    const contract = await this.startupContract(user, contractId);
    if (contract.status !== 'awaiting_funding' && contract.status !== 'active') {
      throw new BadRequestException(
        contract.status === 'awaiting_specialist'
          ? 'El experto todavía no aceptó: edita la oferta completa'
          : 'Este contrato ya no se puede editar',
      );
    }
    const funded = contract.status === 'active';
    const current = await this.prisma.milestone.findMany({
      where: { contractId },
      orderBy: { position: 'asc' },
    });
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const changes: MilestoneChange[] = [];
    const writes: { id: string; data: Prisma.MilestoneUpdateInput }[] = [];
    const positions = new Set<number>();

    for (const input of dto.milestones) {
      if (positions.has(input.position)) {
        throw new BadRequestException('Un hito viene repetido');
      }
      positions.add(input.position);
      const milestone = current.find((each) => each.position === input.position);
      if (!milestone) throw new BadRequestException('Ese hito no existe en el contrato');
      const before = {
        dueDate: milestone.dueDate.toISOString().slice(0, 10),
        description: milestone.description,
        acceptanceCriteria: milestone.acceptanceCriteria ?? null,
      };
      const after = {
        dueDate: input.dueDate,
        description: input.description.trim(),
        acceptanceCriteria: input.acceptanceCriteria?.trim() || null,
      };
      const fields = (['dueDate', 'description', 'acceptanceCriteria'] as const).filter(
        (field) => before[field] !== after[field],
      );
      if (fields.length === 0) continue;
      const label = `El hito ${milestone.position + 1}`;
      if (!EDITABLE_MILESTONE.includes(milestone.status)) {
        throw new BadRequestException(
          `${label} ya se entregó o se pagó: no se puede cambiar`,
        );
      }
      if (fields.includes('dueDate')) {
        if (after.dueDate < today) {
          throw new BadRequestException(
            'La fecha de entrega de un hito no puede estar en el pasado',
          );
        }
        if (funded && after.dueDate < before.dueDate) {
          throw new BadRequestException(
            `${label} ya tiene el pago depositado: su fecha solo puede moverse para más tarde`,
          );
        }
      }
      for (const field of fields) {
        changes.push({
          position: milestone.position,
          title: milestone.title,
          field,
          before: before[field],
          after: after[field],
          at: now.toISOString(),
        });
      }
      writes.push({
        id: milestone.id,
        data: {
          dueDate: new Date(after.dueDate),
          description: after.description,
          acceptanceCriteria: after.acceptanceCriteria,
        },
      });
    }
    if (changes.length === 0) {
      return this.prisma.contract.findUniqueOrThrow({
        where: { id: contractId },
        include: { milestones: { orderBy: { position: 'asc' } } },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.contract.findUnique({
        where: { id: contractId },
        select: { pendingChanges: true },
      });
      const merged = mergeChanges(
        (fresh?.pendingChanges as MilestoneChange[] | null) ?? [],
        changes,
      );
      // Claim the contract in the state the rules above were checked for:
      // a deposit landing meanwhile makes it funded, where dates only move later.
      const claimed = await tx.contract.updateMany({
        where: { id: contractId, status: contract.status },
        data: {
          pendingChanges:
            merged.length > 0
              ? (merged as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('El contrato cambió mientras tanto. Actualiza la página');
      }
      for (const write of writes) {
        const done = await tx.milestone.updateMany({
          where: { id: write.id, status: { in: EDITABLE_MILESTONE } },
          data: write.data,
        });
        if (done.count !== 1) {
          throw new ConflictException('Un hito cambió mientras tanto. Actualiza la página');
        }
      }
      return tx.contract.findUniqueOrThrow({
        where: { id: contractId },
        include: { milestones: { orderBy: { position: 'asc' } } },
      });
    });
  }

  /** The specialist saw what the startup changed: the notice goes away. */
  async markChangesSeen(user: AuthUser, contractId: string): Promise<void> {
    await this.specialistContract(user, contractId);
    await this.prisma.contract.updateMany({
      where: { id: contractId, specialistId: user.sub },
      data: { pendingChanges: Prisma.DbNull },
    });
  }

  /**
   * An escrow the terms can leave behind: empty, and no deposit on its way.
   * Asks the USDC contract itself, so a deposit sent from outside Pocket
   * counts too.
   */
  private async assertEscrowUntouched(contract: Contract): Promise<void> {
    const deposit = await this.prisma.chainOperation.findUnique({
      where: { stepKey: `fund:${contract.id}` },
    });
    if (deposit) {
      throw new ConflictException(
        'Ya hay un depósito en camino: espera a que se confirme antes de editar',
      );
    }
    if (contract.escrowId && (await this.escrow.holdsUsdc(contract))) {
      throw new ConflictException(
        'El pago protegido ya tiene fondos: solo puedes cambiar fechas, descripciones y criterios',
      );
    }
  }

  private async jobTitle(jobId: string): Promise<string> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { title: true },
    });
    return job?.title ?? 'tu trabajo';
  }

  /**
   * The specialist accepts the terms and Pocket deploys the escrow. Their
   * wallet must already trust USDC, or it could not receive the payments.
   */
  async accept(
    user: AuthUser,
    contractId: string,
    termsVersion?: string,
  ): Promise<Contract> {
    const contract = await this.specialistContract(user, contractId);
    if (contract.status !== 'awaiting_specialist') {
      throw new BadRequestException(
        'Solo puedes aceptar términos que todavía esperan tu respuesta',
      );
    }
    const seen = termsVersion ? new Date(termsVersion) : null;
    if (seen && seen.getTime() !== contract.updatedAt.getTime()) {
      throw new ConflictException(TERMS_CHANGED);
    }
    await this.requireUsdcReady(user);

    // Claim the contract so a double click cannot deploy two escrows, and only
    // in the version the specialist read: the startup may have just edited it.
    const claimed = await this.prisma.contract.updateMany({
      where: {
        id: contractId,
        status: 'awaiting_specialist',
        acceptedAt: null,
        ...(seen ? { updatedAt: seen } : {}),
      },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count !== 1) {
      const now = await this.prisma.contract.findUnique({
        where: { id: contractId },
        select: { acceptedAt: true },
      });
      throw new ConflictException(
        seen && now && !now.acceptedAt
          ? TERMS_CHANGED
          : 'Este contrato ya se está aceptando',
      );
    }

    const full = await this.prisma.contract.findUniqueOrThrow({
      where: { id: contractId },
      include: {
        job: { select: { title: true, description: true } },
        startup: { select: { stellarAddress: true } },
        milestones: true,
      },
    });

    let escrowId: string;
    try {
      escrowId = await this.escrow.deploy({
        contract: full,
        title: full.job.title,
        description: full.job.description,
        milestones: full.milestones,
        startupAddress: full.startup.stellarAddress,
        specialistAddress: user.stellarAddress,
      });
    } catch (error) {
      // Back to the version the specialist read, so they can try again.
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { acceptedAt: null, updatedAt: contract.updatedAt },
      });
      throw error;
    }

    // Read before they are turned down below, to tell them.
    const onHold = await this.prisma.application.findMany({
      where: { jobId: contract.jobId, status: 'submitted' },
      select: { specialistId: true },
    });
    const [, accepted] = await this.prisma.$transaction([
      this.prisma.contract.updateMany({
        where: { id: contractId, status: 'awaiting_specialist' },
        // The deploy policy refused to sign unless the escrow carries this fee.
        data: {
          status: 'awaiting_funding',
          escrowId,
          platformFeeBps: POCKET_PLATFORM_FEE_ON_CHAIN,
        },
      }),
      this.prisma.contract.findUniqueOrThrow({ where: { id: contractId } }),
      // The hire is final now: the applicants who were on hold are turned down.
      this.prisma.application.updateMany({
        where: { jobId: contract.jobId, status: 'submitted' },
        data: { status: 'rejected', decidedAt: new Date() },
      }),
    ]);
    this.notifications.notifyUsers([accepted.startupId], {
      type: 'terms_accepted',
      contractId,
      jobTitle: full.job.title,
    });
    if (onHold.length > 0) {
      this.notifications.notifyUsers(
        onHold.map((application) => application.specialistId),
        { type: 'application_not_selected', jobTitle: full.job.title },
      );
    }
    return accepted;
  }

  /** Funding transaction for the startup's wallet to sign. */
  async prepareFund(user: AuthUser, contractId: string): Promise<PreparedTransaction> {
    const contract = await this.startupContract(user, contractId);
    if (contract.status !== 'awaiting_funding') {
      throw new BadRequestException('Este contrato no está esperando el depósito');
    }
    // Never a second deposit: not when the escrow already holds the money,
    // and not while a deposit already sent is still being confirmed.
    if (await this.escrow.isFunded(contract)) {
      await this.activate(contractId);
      throw new ConflictException(
        'El pago ya está depositado en el contrato, que ya está activo',
      );
    }
    const sent = await this.prisma.chainOperation.findUnique({
      where: { stepKey: `fund:${contractId}` },
    });
    if (sent) {
      throw new ConflictException(
        'La red todavía está confirmando tu depósito. Revisa de nuevo en un minuto',
      );
    }
    await this.requireUsdcReady(user);
    await this.requireUsdcFor(user.stellarAddress, contract.amount);
    return this.escrow.prepareFund(contract, user.sub, user.stellarAddress);
  }

  /**
   * Broadcast the startup's signed funding transaction. The contract becomes
   * active only once the escrow's balance on chain covers the full amount.
   */
  async submitFund(user: AuthUser, contractId: string, signedXdr: string) {
    const contract = await this.startupContract(user, contractId);
    if (contract.status !== 'awaiting_funding') {
      throw new BadRequestException('Este contrato no está esperando el depósito');
    }
    await this.escrow.submitFund(contractId, signedXdr, user.sub);
    return this.syncFunding(user, contractId);
  }

  /**
   * Check the escrow's balance and activate the contract if it is funded.
   * Safe to call again, for when the chain took a moment to show the deposit.
   */
  async syncFunding(user: AuthUser, contractId: string): Promise<Contract> {
    const contract = await this.startupContract(user, contractId);
    if (contract.status !== 'awaiting_funding') return contract;
    if (!(await this.escrow.isFunded(contract))) {
      throw new ConflictException(
        'El contrato todavía no tiene el monto completo. Intenta de nuevo en unos segundos',
      );
    }
    return this.activate(contractId);
  }

  /**
   * Only the call that moves the contract out of awaiting_funding tells the
   * specialist, so two syncs at once do not send two emails.
   */
  private async activate(contractId: string): Promise<Contract> {
    const activated = await this.prisma.contract.updateMany({
      where: { id: contractId, status: 'awaiting_funding' },
      data: { status: 'active', fundedAt: new Date() },
    });
    const contract = await this.prisma.contract.findUniqueOrThrow({
      where: { id: contractId },
    });
    if (activated.count === 1) {
      this.notifications.notifyUsers([contract.specialistId], {
        type: 'escrow_funded',
        contractId,
      });
    }
    return contract;
  }

  private async specialistContract(
    user: AuthUser,
    contractId: string,
  ): Promise<Contract> {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('No encontramos el contrato');
    if (contract.specialistId !== user.sub) {
      throw new ForbiddenException('Solo el experto contratado puede hacer esto');
    }
    return contract;
  }

  private async startupContract(user: AuthUser, contractId: string): Promise<Contract> {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('No encontramos el contrato');
    if (contract.startupId !== user.sub) {
      throw new ForbiddenException('Solo la startup que contrató puede hacer esto');
    }
    return contract;
  }

  /**
   * The wallet must exist on the network and trust USDC. A Pollar wallet that
   * Pocket could not activate before (Pollar timed out) gets another try here,
   * and its owner never reads about XLM: activating it is Pocket's job.
   */
  private async requireUsdcReady(user: AuthUser): Promise<void> {
    let readiness = await this.stellar.usdcReadiness(user.stellarAddress);
    if (readiness === 'no_account' && (await this.wallets.activate(user.sub))) {
      readiness = await this.stellar.usdcReadiness(user.stellarAddress);
    }
    if (readiness === 'ready') return;
    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { walletCustody: true },
    });
    const throughPollar = account?.walletCustody === 'pollar';
    if (readiness === 'no_account') {
      throw new BadRequestException({
        code: ApiErrorCode.StellarAccountNotFound,
        message: throughPollar
          ? 'Estamos activando tu billetera. Intenta de nuevo en un minuto'
          : 'Tu wallet todavía no está activa en Stellar. Primero agrégale algo de XLM',
      });
    }
    throw new BadRequestException({
      code: ApiErrorCode.UsdcTrustlineRequired,
      // The page enables it for a Pollar wallet in the same click; this is
      // what is left when it could not.
      message: throughPollar
        ? 'Estamos preparando tu billetera para recibir USDC. Intenta de nuevo en unos segundos'
        : 'Primero habilita USDC en tu wallet',
    });
  }

  /**
   * Refuse to prepare a funding the wallet cannot pay, with the numbers, instead
   * of letting the transaction fail on chain after the user signs it.
   */
  private async requireUsdcFor(address: string, amount: Prisma.Decimal): Promise<void> {
    const spendable = await this.stellar.spendableUsdc(address);
    if (spendable !== null && amount.lte(spendable)) return;
    const have = new Prisma.Decimal(spendable ?? 0);
    throw new BadRequestException({
      code: ApiErrorCode.InsufficientUsdc,
      message: `Tu wallet tiene ${have.toString()} USDC y el contrato necesita ${amount.toString()} USDC. Agrega ${amount.minus(have).toString()} USDC e intenta de nuevo`,
    });
  }

  /**
   * An escrow between two accounts of the same person protects nobody, and a
   * dispute would have a manager arbitrating someone against themselves. The
   * contact email of the approved verification is what ties the two accounts.
   */
  private async assertDifferentPeople(
    startupId: string,
    specialistId: string,
  ): Promise<void> {
    if (startupId === specialistId) {
      throw new BadRequestException('No puedes contratar a tu propia cuenta');
    }
    const emails = await this.contactEmails([startupId, specialistId]);
    const startupEmail = emails.get(startupId)?.toLowerCase();
    const specialistEmail = emails.get(specialistId)?.toLowerCase();
    if (startupEmail && startupEmail === specialistEmail) {
      throw new BadRequestException(
        'Las dos cuentas se verificaron con el mismo correo de contacto, así que no pueden contratarse entre sí',
      );
    }
  }

  /** Contact email from each user's approved verification. */
  private contactEmails(userIds: string[]): Promise<Map<string, string>> {
    return contactEmails(this.prisma, userIds);
  }
}

/**
 * Parties see their own contracts; managers see every contract. Anyone else
 * is told it does not exist, as for an id that matches nothing.
 */
export function assertCanView(
  user: AuthUser,
  contract: Pick<Contract, 'startupId' | 'specialistId'>,
): void {
  if (
    user.role !== 'manager' &&
    contract.startupId !== user.sub &&
    contract.specialistId !== user.sub
  ) {
    throw new NotFoundException('No encontramos el contrato');
  }
}

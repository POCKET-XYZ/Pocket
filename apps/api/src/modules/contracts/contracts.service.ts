import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorCode } from '@pocket/shared';
import { Prisma, type Contract, type ContractStatus } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import type { PreparedTransaction } from '../stellar/chain-operations.service';
import { StellarService } from '../stellar/stellar.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { contactEmails } from '../users/contact-emails';
import { CreateContractDto } from './dto/create-contract.dto';
import { DELIVERABLE_REPORT } from './deliverable-report';
import { EscrowService } from './escrow.service';

const DETAIL_INCLUDE = {
  job: {
    select: {
      id: true,
      title: true,
      category: true,
      deadline: true,
      status: true,
      revisionRounds: true,
      kpis: { orderBy: { position: 'asc' } },
    },
  },
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
    where: { status: 'confirmed' },
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
  ) {}

  /**
   * The startup chooses an applicant and splits the agreed price into
   * milestones. The job stops taking applications; the other applicants stay
   * on hold until the specialist accepts, so the startup can pick someone else
   * if they decline.
   */
  async create(user: AuthUser, dto: CreateContractDto): Promise<Contract> {
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
    });
    if (!application) throw new NotFoundException('Application not found');
    const jobId = application.jobId;
    const job = await this.jobs.ownedJob(user, jobId);
    if (job.status !== 'open') {
      throw new BadRequestException('This job is not open for hiring');
    }
    if (application.status !== 'submitted') {
      throw new BadRequestException('This application is no longer available');
    }

    await this.assertDifferentPeople(user.sub, application.specialistId);

    const today = new Date().toISOString().slice(0, 10);
    if (dto.milestones.some((milestone) => milestone.dueDate < today)) {
      throw new BadRequestException('A milestone cannot be due in the past');
    }
    const total = dto.milestones.reduce(
      (sum, milestone) => sum.plus(milestone.amount),
      new Prisma.Decimal(0),
    );
    if (!total.equals(application.price)) {
      throw new BadRequestException(
        `The milestones add up to ${total.toString()} USDC but the agreed price is ${application.price.toString()} USDC`,
      );
    }

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
        throw new ConflictException('This job or application changed meanwhile. Refresh');
      }
      return tx.contract.create({
        data: {
          jobId,
          applicationId: application.id,
          startupId: user.sub,
          specialistId: application.specialistId,
          amount: application.price,
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
    });
    return created;
  }

  /** Contracts the signed-in user is a party to, newest first. */
  mine(user: AuthUser) {
    return this.prisma.contract.findMany({
      where:
        user.role === 'startup' ? { startupId: user.sub } : { specialistId: user.sub },
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
    if (!contract) throw new NotFoundException('Contract not found');
    assertCanView(user, contract);

    const hired = CONTACT_STATUSES.includes(contract.status);
    const contacts = hired
      ? await this.contactEmails([contract.startupId, contract.specialistId])
      : new Map<string, string>();
    return {
      ...contract,
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
      throw new BadRequestException('Only terms still waiting for you can be declined');
    }

    return this.prisma.$transaction(async (tx) => {
      // Not while an accept is deploying the escrow: that would reopen the
      // job under a contract about to hold money.
      const claimed = await tx.contract.updateMany({
        where: { id: contractId, status: 'awaiting_specialist', acceptedAt: null },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('These terms are being accepted already');
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
  }

  /**
   * The startup takes back terms the specialist has not accepted yet, to fix
   * them or to choose someone else. Nothing was on chain, so the offer is
   * removed, the application waits again and the job opens again.
   */
  async withdrawOffer(user: AuthUser, contractId: string): Promise<{ jobId: string }> {
    const contract = await this.startupContract(user, contractId);
    if (contract.status !== 'awaiting_specialist') {
      throw new BadRequestException('Only terms the specialist has not accepted can be withdrawn');
    }

    return this.prisma.$transaction(async (tx) => {
      // Not while an accept is deploying the escrow.
      const removed = await tx.contract.deleteMany({
        where: { id: contractId, status: 'awaiting_specialist', acceptedAt: null },
      });
      if (removed.count !== 1) {
        throw new ConflictException('The specialist is accepting these terms right now');
      }
      await tx.application.update({
        where: { id: contract.applicationId },
        data: { status: 'submitted', decidedAt: null },
      });
      await tx.job.update({ where: { id: contract.jobId }, data: { status: 'open' } });
      return { jobId: contract.jobId };
    });
  }

  /**
   * The specialist accepts the terms and Pocket deploys the escrow. Their
   * wallet must already trust USDC, or it could not receive the payments.
   */
  async accept(user: AuthUser, contractId: string): Promise<Contract> {
    const contract = await this.specialistContract(user, contractId);
    if (contract.status !== 'awaiting_specialist') {
      throw new BadRequestException('Only terms still waiting for you can be accepted');
    }
    await this.requireUsdcReady(user.stellarAddress);

    // Claim the contract so a double click cannot deploy two escrows.
    const claimed = await this.prisma.contract.updateMany({
      where: { id: contractId, status: 'awaiting_specialist', acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('This contract is already being accepted');
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
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { acceptedAt: null },
      });
      throw error;
    }

    const [, accepted] = await this.prisma.$transaction([
      this.prisma.contract.updateMany({
        where: { id: contractId, status: 'awaiting_specialist' },
        data: { status: 'awaiting_funding', escrowId },
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
    return accepted;
  }

  /** Funding transaction for the startup's wallet to sign. */
  async prepareFund(user: AuthUser, contractId: string): Promise<PreparedTransaction> {
    const contract = await this.startupContract(user, contractId);
    if (contract.status !== 'awaiting_funding') {
      throw new BadRequestException('This contract is not waiting for funding');
    }
    // Never a second deposit: not when the escrow already holds the money,
    // and not while a deposit already sent is still being confirmed.
    if (await this.escrow.isFunded(contract)) {
      await this.activate(contractId);
      throw new ConflictException('This escrow is already funded. The contract is active now');
    }
    const sent = await this.prisma.chainOperation.findUnique({
      where: { stepKey: `fund:${contractId}` },
    });
    if (sent) {
      throw new ConflictException(
        'Your deposit is still being confirmed by the network. Check again in a minute',
      );
    }
    await this.requireUsdcReady(user.stellarAddress);
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
      throw new BadRequestException('This contract is not waiting for funding');
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
        'The escrow does not hold the full amount yet. Try again in a few seconds',
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
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.specialistId !== user.sub) {
      throw new ForbiddenException('Only the hired specialist can do this');
    }
    return contract;
  }

  private async startupContract(user: AuthUser, contractId: string): Promise<Contract> {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.startupId !== user.sub) {
      throw new ForbiddenException('Only the startup that hired can do this');
    }
    return contract;
  }

  private async requireUsdcReady(address: string): Promise<void> {
    const readiness = await this.stellar.usdcReadiness(address);
    if (readiness === 'no_account') {
      throw new BadRequestException({
        code: ApiErrorCode.StellarAccountNotFound,
        message: 'Your wallet is not active on Stellar yet. Fund it with some XLM first',
      });
    }
    if (readiness === 'no_trustline') {
      throw new BadRequestException({
        code: ApiErrorCode.UsdcTrustlineRequired,
        message: 'Enable USDC in your wallet first',
      });
    }
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
      message: `Your wallet holds ${have.toString()} USDC and the escrow needs ${amount.toString()} USDC. Add ${amount.minus(have).toString()} USDC and try again`,
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
      throw new BadRequestException('You cannot hire yourself');
    }
    const emails = await this.contactEmails([startupId, specialistId]);
    const startupEmail = emails.get(startupId)?.toLowerCase();
    const specialistEmail = emails.get(specialistId)?.toLowerCase();
    if (startupEmail && startupEmail === specialistEmail) {
      throw new BadRequestException(
        'Both accounts were verified with the same contact email, so they cannot hire each other',
      );
    }
  }

  /** Contact email from each user's approved verification. */
  private contactEmails(userIds: string[]): Promise<Map<string, string>> {
    return contactEmails(this.prisma, userIds);
  }
}

/** Parties see their own contracts; managers see every contract. */
export function assertCanView(
  user: AuthUser,
  contract: Pick<Contract, 'startupId' | 'specialistId'>,
): void {
  if (
    user.role !== 'manager' &&
    contract.startupId !== user.sub &&
    contract.specialistId !== user.sub
  ) {
    throw new ForbiddenException('You are not a party to this contract');
  }
}

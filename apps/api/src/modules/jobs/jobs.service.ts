import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Job } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import { BrowseJobsDto } from './dto/browse-jobs.dto';
import { CreateJobDto, UpdateJobDto } from './dto/create-job.dto';
import { canSeeDraft } from './drafts';
import { cleanKpis } from './kpis';
import { REPORT_TEMPLATE_INFO } from './report-template-info';

/** What the board shows about who posted a job. */
const LISTING_INCLUDE = {
  startup: {
    select: { startupProfile: { select: { companyName: true, logoUrl: true } } },
  },
  _count: { select: { applications: true } },
  milestones: { orderBy: { position: 'asc' } },
  kpis: { orderBy: { position: 'asc' } },
  reportTemplate: { select: REPORT_TEMPLATE_INFO },
} satisfies Prisma.JobInclude;

type JobWithListing = Prisma.JobGetPayload<{ include: typeof LISTING_INCLUDE }>;

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Post a job, or save it as a draft that only the startup sees. The startup
   * needs a profile, since the board shows who is hiring.
   */
  async create(user: AuthUser, dto: CreateJobDto): Promise<Job> {
    if (user.role !== 'startup') {
      throw new ForbiddenException('Solo las startups pueden publicar trabajos');
    }
    assertJobFits(dto);
    await this.assertHasProfile(user);

    const { draft, ...content } = dto;
    return await this.prisma.job.create({
      data: {
        ...contentData(content),
        startupId: user.sub,
        status: draft ? 'draft' : 'open',
        publishedAt: draft ? null : new Date(),
        milestones: { create: milestonesData(content) },
        kpis: { create: kpisData(content) },
      },
    });
  }

  /**
   * Replace a draft with what the form sends now. Only drafts change: once a
   * job is posted, specialists apply to what they read.
   */
  async update(user: AuthUser, jobId: string, dto: UpdateJobDto): Promise<Job> {
    const job = await this.ownedJob(user, jobId);
    if (job.status !== 'draft') {
      throw new BadRequestException(NOT_A_DRAFT_EDIT);
    }
    assertJobFits(dto);

    return this.prisma.$transaction(async (tx) => {
      // Only while still a draft: not under a publish sent at the same moment.
      const claimed = await tx.job.updateMany({
        where: { id: jobId, status: 'draft' },
        data: contentData(dto),
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(NOT_A_DRAFT_EDIT);
      }
      await tx.jobMilestone.deleteMany({ where: { jobId } });
      await tx.jobKpi.deleteMany({ where: { jobId } });
      await tx.jobMilestone.createMany({
        data: milestonesData(dto).map((milestone) => ({ ...milestone, jobId })),
      });
      await tx.jobKpi.createMany({
        data: kpisData(dto).map((kpi) => ({ ...kpi, jobId })),
      });
      return tx.job.findUniqueOrThrow({ where: { id: jobId } });
    });
  }

  /**
   * Post a draft to the board. Its dates are checked again, since a draft can
   * wait for days: a date that has passed has to be changed first.
   */
  async publish(user: AuthUser, jobId: string): Promise<Job> {
    const job = await this.ownedJob(user, jobId);
    if (job.status !== 'draft') {
      throw new BadRequestException(ALREADY_POSTED);
    }
    await this.assertHasProfile(user);
    const today = todayUtc();
    if (isoDate(job.deadline) < today) {
      throw new BadRequestException(
        'La fecha límite de este borrador ya pasó. Edítalo y elige fechas nuevas antes de publicarlo.',
      );
    }
    const late = await this.prisma.jobMilestone.findFirst({
      where: { jobId, dueDate: { lt: new Date(today) } },
      orderBy: { position: 'asc' },
      select: { title: true },
    });
    if (late) {
      throw new BadRequestException(
        `La fecha de entrega de "${late.title}" ya pasó. Edita el borrador y elige fechas nuevas antes de publicarlo.`,
      );
    }

    const published = await this.prisma.job.updateMany({
      where: { id: jobId, status: 'draft' },
      data: { status: 'open', publishedAt: new Date() },
    });
    if (published.count !== 1) {
      throw new BadRequestException(ALREADY_POSTED);
    }
    return this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  }

  /** Delete a draft. A posted job is closed instead, so its history stays. */
  async remove(user: AuthUser, jobId: string): Promise<{ deleted: true }> {
    const job = await this.ownedJob(user, jobId);
    if (job.status !== 'draft') {
      throw new BadRequestException(NOT_A_DRAFT_DELETE);
    }
    const deleted = await this.prisma.job.deleteMany({
      where: { id: jobId, status: 'draft' },
    });
    if (deleted.count !== 1) {
      throw new BadRequestException(NOT_A_DRAFT_DELETE);
    }
    return { deleted: true };
  }

  /** Public board of open jobs, newest first. */
  async board(query: BrowseJobsDto) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const search = query.search?.trim();

    const where: Prisma.JobWhereInput = {
      status: 'open',
      ...(query.category ? { category: query.category } : {}),
      ...(query.startupId ? { startupId: query.startupId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [jobs, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        include: LISTING_INCLUDE,
        // A job posted by a version from before drafts has no date: it goes last.
        orderBy: [
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        take: limit,
        skip: offset,
      }),
      this.prisma.job.count({ where }),
    ]);

    return { items: jobs.map(toListing), total, limit, offset };
  }

  /** Every job the signed-in startup posted, newest first. */
  async mine(user: AuthUser) {
    const jobs = await this.prisma.job.findMany({
      where: { startupId: user.sub },
      include: {
        ...LISTING_INCLUDE,
        applications: { where: { status: 'submitted' }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map(({ applications, ...job }) => ({
      ...toListing(job),
      submittedApplications: applications.length,
    }));
  }

  /**
   * Public detail of a job. A draft exists only for its startup and managers:
   * anyone else gets the same answer as for a job that does not exist.
   */
  async detail(jobId: string, user?: AuthUser) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: LISTING_INCLUDE,
    });
    if (!job || (job.status === 'draft' && !canSeeDraft(user, job.startupId))) {
      throw new NotFoundException('No encontramos el trabajo');
    }
    return toListing(job);
  }

  /**
   * Close an open job before anyone is hired. Applications still waiting are
   * rejected, so no specialist is left hanging.
   */
  async close(user: AuthUser, jobId: string): Promise<Job> {
    const job = await this.ownedJob(user, jobId);
    if (job.status !== 'open') {
      throw new BadRequestException('Solo se puede cerrar un trabajo abierto');
    }

    return this.prisma.$transaction(async (tx) => {
      // Only while still open: not under an offer sent at the same moment.
      const claimed = await tx.job.updateMany({
        where: { id: jobId, status: 'open' },
        data: { status: 'closed' },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Solo se puede cerrar un trabajo abierto');
      }
      await tx.application.updateMany({
        where: { jobId, status: 'submitted' },
        data: { status: 'rejected', decidedAt: new Date() },
      });
      return tx.job.findUniqueOrThrow({ where: { id: jobId } });
    });
  }

  private async assertHasProfile(user: AuthUser): Promise<void> {
    const profile = await this.prisma.startupProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new BadRequestException(
        'Completa tu perfil de startup antes de publicar un trabajo',
      );
    }
  }

  /** A job the signed-in startup owns, or an error. */
  async ownedJob(user: AuthUser, jobId: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('No encontramos el trabajo');
    if (job.startupId !== user.sub) {
      throw new ForbiddenException('Este trabajo es de otra startup');
    }
    return job;
  }
}

function toListing({ startup, _count, ...job }: JobWithListing) {
  return {
    ...job,
    startup: startup.startupProfile,
    applicationCount: _count.applications,
  };
}

const NOT_A_DRAFT_EDIT =
  'Solo se puede editar un borrador. Un trabajo publicado ya no cambia.';
const NOT_A_DRAFT_DELETE =
  'Solo se puede eliminar un borrador. Un trabajo publicado se cierra.';
const ALREADY_POSTED = 'Este trabajo ya está publicado';

/** The job's own fields as stored, with what the form left empty cleared. */
function contentData(dto: UpdateJobDto) {
  return {
    title: dto.title,
    description: dto.description,
    category: dto.category,
    deliverables: dto.deliverables,
    budget: dto.budget,
    deadline: new Date(dto.deadline),
    revisionRounds: dto.revisionRounds ?? 1,
    channel: dto.channel ?? null,
    contentLanguage: dto.contentLanguage ?? null,
    startupProvides: dto.startupProvides ?? null,
  };
}

function milestonesData(dto: UpdateJobDto) {
  return dto.milestones.map((milestone, position) => ({
    ...milestone,
    position,
    dueDate: new Date(milestone.dueDate),
  }));
}

/** The cleaned KPIs, in place of the raw list from the form. */
function kpisData(dto: UpdateJobDto) {
  return cleanKpis(dto.kpis).map((kpi, position) => ({ ...kpi, position }));
}

/** Today's date in UTC as YYYY-MM-DD, comparable with a deadline string. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** What a job has to meet to be saved, as a draft or posted. */
function assertJobFits(dto: UpdateJobDto): void {
  if (dto.deadline < todayUtc()) {
    throw new BadRequestException('La fecha límite no puede estar en el pasado');
  }
  assertMilestonesMatch(dto);
  cleanKpis(dto.kpis);
}

/**
 * The milestones are the payment plan: together they are the budget, and none
 * of them can be due after the job itself.
 */
function assertMilestonesMatch(dto: UpdateJobDto): void {
  const total = dto.milestones.reduce(
    (sum, milestone) => sum.plus(milestone.amount),
    new Prisma.Decimal(0),
  );
  if (!total.equals(dto.budget)) {
    throw new BadRequestException(
      `Los hitos suman ${total.toString()} USDC, pero el presupuesto es ${dto.budget} USDC`,
    );
  }
  const late = dto.milestones.find((milestone) => milestone.dueDate > dto.deadline);
  if (late) {
    throw new BadRequestException(
      `La fecha de entrega de "${late.title}" es posterior a la fecha límite del trabajo (${dto.deadline})`,
    );
  }
  const past = dto.milestones.find((milestone) => milestone.dueDate < todayUtc());
  if (past) {
    throw new BadRequestException(
      `La fecha de entrega de "${past.title}" está en el pasado`,
    );
  }
}

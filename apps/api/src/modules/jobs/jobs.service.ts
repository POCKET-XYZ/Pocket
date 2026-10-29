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
import { CreateJobDto } from './dto/create-job.dto';
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

  /** Post a job. The startup needs a profile, since the board shows who is hiring. */
  async create(user: AuthUser, dto: CreateJobDto): Promise<Job> {
    if (user.role !== 'startup') {
      throw new ForbiddenException('Solo las startups pueden publicar trabajos');
    }
    if (dto.deadline < todayUtc()) {
      throw new BadRequestException('La fecha límite no puede estar en el pasado');
    }
    assertMilestonesMatch(dto);
    const kpis = cleanKpis(dto.kpis);
    const profile = await this.prisma.startupProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new BadRequestException(
        'Completa tu perfil de startup antes de publicar un trabajo',
      );
    }

    const { milestones, ...job } = dto;
    return await this.prisma.job.create({
      data: {
        ...job,
        deadline: new Date(dto.deadline),
        startupId: user.sub,
        milestones: {
          create: milestones.map((milestone, position) => ({
            ...milestone,
            position,
            dueDate: new Date(milestone.dueDate),
          })),
        },
        // Replaces the raw list from the form with the cleaned one.
        kpis: {
          create: kpis.map((kpi, position) => ({ ...kpi, position })),
        },
      },
    });
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
        orderBy: { createdAt: 'desc' },
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
      include: LISTING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map(toListing);
  }

  /** Public detail of a job. */
  async detail(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: LISTING_INCLUDE,
    });
    if (!job) throw new NotFoundException('No encontramos el trabajo');
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

/** Today's date in UTC as YYYY-MM-DD, comparable with a deadline string. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The milestones are the payment plan: together they are the budget, and none
 * of them can be due after the job itself.
 */
function assertMilestonesMatch(dto: CreateJobDto): void {
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

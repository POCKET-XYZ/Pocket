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

/** What the board shows about who posted a job. */
const LISTING_INCLUDE = {
  startup: {
    select: { startupProfile: { select: { companyName: true, logoUrl: true } } },
  },
  _count: { select: { applications: true } },
  milestones: { orderBy: { position: 'asc' } },
  kpis: { orderBy: { position: 'asc' } },
} satisfies Prisma.JobInclude;

type JobWithListing = Prisma.JobGetPayload<{ include: typeof LISTING_INCLUDE }>;

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Post a job. The startup needs a profile, since the board shows who is hiring. */
  async create(user: AuthUser, dto: CreateJobDto): Promise<Job> {
    if (user.role !== 'startup') {
      throw new ForbiddenException('Only startups post jobs');
    }
    if (dto.deadline < todayUtc()) {
      throw new BadRequestException('The deadline cannot be in the past');
    }
    assertMilestonesMatch(dto);
    const kpis = cleanKpis(dto);
    const profile = await this.prisma.startupProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new BadRequestException('Fill in your startup profile before posting a job');
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
    if (!job) throw new NotFoundException('Job not found');
    return toListing(job);
  }

  /**
   * Close an open job before anyone is hired. Applications still waiting are
   * rejected, so no specialist is left hanging.
   */
  async close(user: AuthUser, jobId: string): Promise<Job> {
    const job = await this.ownedJob(user, jobId);
    if (job.status !== 'open') {
      throw new BadRequestException('Only an open job can be closed');
    }

    return this.prisma.$transaction(async (tx) => {
      // Only while still open: not under an offer sent at the same moment.
      const claimed = await tx.job.updateMany({
        where: { id: jobId, status: 'open' },
        data: { status: 'closed' },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Only an open job can be closed');
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
    if (!job) throw new NotFoundException('Job not found');
    if (job.startupId !== user.sub) {
      throw new ForbiddenException('This job belongs to another startup');
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
      `The milestones add up to ${total.toString()} USDC but the budget is ${dto.budget} USDC`,
    );
  }
  const late = dto.milestones.find((milestone) => milestone.dueDate > dto.deadline);
  if (late) {
    throw new BadRequestException(
      `"${late.title}" is due after the job deadline (${dto.deadline})`,
    );
  }
  const past = dto.milestones.find((milestone) => milestone.dueDate < todayUtc());
  if (past) {
    throw new BadRequestException(`"${past.title}" is due in the past`);
  }
}

/**
 * The KPIs as stored: trimmed, without empty optional parts, and each name
 * once, since every delivery reports one result per KPI by name.
 */
function cleanKpis(
  dto: CreateJobDto,
): { name: string; target?: string; unit?: string }[] {
  const kpis = (dto.kpis ?? []).map((kpi) => ({
    name: kpi.name.trim(),
    ...(kpi.target?.trim() ? { target: kpi.target.trim() } : {}),
    ...(kpi.unit?.trim() ? { unit: kpi.unit.trim() } : {}),
  }));
  const seen = new Set<string>();
  for (const kpi of kpis) {
    if (kpi.name.length < 2) {
      throw new BadRequestException('Give every KPI a name of at least 2 characters');
    }
    const key = kpi.name.toLowerCase();
    if (seen.has(key)) {
      throw new BadRequestException(`"${kpi.name}" is listed twice as a KPI`);
    }
    seen.add(key);
  }
  return kpis;
}

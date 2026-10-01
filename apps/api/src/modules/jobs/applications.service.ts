import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Application } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplyDto } from './dto/apply.dto';
import { JobsService } from './jobs.service';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  /**
   * Apply to an open job, once. The specialist needs a profile, since it is
   * what the startup looks at when choosing.
   */
  async apply(user: AuthUser, jobId: string, dto: ApplyDto): Promise<Application> {
    if (user.role !== 'specialist') {
      throw new ForbiddenException('Only specialists apply to jobs');
    }
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== 'open') {
      throw new BadRequestException('This job is no longer taking applications');
    }
    const profile = await this.prisma.specialistProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new BadRequestException('Fill in your specialist profile before applying');
    }

    try {
      return await this.prisma.application.create({
        data: { ...dto, jobId, specialistId: user.sub },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You already applied to this job');
      }
      throw error;
    }
  }

  /** Applicants to one of the startup's jobs, oldest first. */
  async forJob(user: AuthUser, jobId: string) {
    await this.jobs.ownedJob(user, jobId);
    const applications = await this.prisma.application.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      include: {
        specialist: {
          select: {
            specialistProfile: {
              select: { displayName: true, headline: true, avatarUrl: true },
            },
          },
        },
        // The terms sent to this applicant, to go from the job to its contract.
        contract: { select: { id: true, status: true } },
      },
    });
    return applications.map(({ specialist, ...application }) => ({
      ...application,
      specialist: specialist.specialistProfile,
    }));
  }

  /** The signed-in specialist's applications, newest first. */
  mine(user: AuthUser) {
    return this.prisma.application.findMany({
      where: { specialistId: user.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            category: true,
            budget: true,
            deadline: true,
            status: true,
          },
        },
        contract: { select: { id: true, status: true } },
      },
    });
  }

  /** Withdraw an application the startup has not decided on yet. */
  async withdraw(user: AuthUser, applicationId: string): Promise<Application> {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.specialistId !== user.sub) {
      throw new ForbiddenException('This application belongs to another specialist');
    }
    if (application.status !== 'submitted') {
      throw new BadRequestException('Only an application still waiting can be withdrawn');
    }

    // Only while still waiting: not after an offer claimed it meanwhile.
    const claimed = await this.prisma.application.updateMany({
      where: { id: applicationId, status: 'submitted' },
      data: { status: 'withdrawn', decidedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Only an application still waiting can be withdrawn');
    }
    return this.prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  }
}

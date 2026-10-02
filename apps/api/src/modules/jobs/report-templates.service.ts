import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth';
import {
  safeFileName,
  sniffReportFile,
  type UploadedBytes,
} from '../../common/uploads/file-type';
import type { PrivateFile } from '../../common/uploads/send-file';
import { PrismaService } from '../../prisma/prisma.service';
import { REPORT_TEMPLATE_INFO } from './report-template-info';

/** The largest report template a job can carry, the same as a delivery's file. */
export const MAX_REPORT_TEMPLATE_BYTES = 5 * 1024 * 1024;

/**
 * The report a startup wants back, as a file the specialist fills in and
 * attaches to each delivery. It is part of the brief, so verified
 * specialists can download it, but it is not public: it may say how the
 * startup measures its business.
 */
@Injectable()
export class ReportTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attach or replace the job's report template while the job is open. Only
   * a real PDF, Excel (.xlsx), Word (.docx) or CSV file is kept, read from
   * its bytes; macro-enabled Office files are refused.
   */
  async save(user: AuthUser, jobId: string, file: UploadedBytes | undefined) {
    await this.openOwnedJob(user, jobId);

    if (!file?.buffer.length) throw new BadRequestException('Choose a file');
    if (file.buffer.length > MAX_REPORT_TEMPLATE_BYTES) {
      throw new PayloadTooLargeException('The file is too big. The limit is 5 MB');
    }
    const contentType = sniffReportFile(file.buffer);
    if (!contentType) {
      throw new BadRequestException(
        'Upload the report template as a PDF, Excel (.xlsx), Word (.docx) or CSV file, without macros',
      );
    }

    const data = new Uint8Array(file.buffer);
    const fileName = safeFileName(file.originalname, contentType, 'report-template');
    return this.prisma.jobReportTemplate.upsert({
      where: { jobId },
      create: { jobId, data, contentType, fileName, size: data.length },
      update: { data, contentType, fileName, size: data.length },
      select: REPORT_TEMPLATE_INFO,
    });
  }

  /** Remove the job's report template while the job is open. */
  async remove(user: AuthUser, jobId: string): Promise<{ deleted: true }> {
    await this.openOwnedJob(user, jobId);
    await this.prisma.jobReportTemplate.deleteMany({ where: { jobId } });
    return { deleted: true };
  }

  /**
   * The job's report template, for the startup that posted it, verified
   * specialists, who read it as part of the brief, and managers.
   */
  async fileOf(user: AuthUser, jobId: string): Promise<PrivateFile> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        startupId: true,
        reportTemplate: { select: { data: true, fileName: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    // Who may read it is decided before saying whether there is a file at all.
    await this.assertCanRead(user, job.startupId);

    const data = job.reportTemplate ? Buffer.from(job.reportTemplate.data) : null;
    // Checked again on the way out: only these types are ever served.
    const contentType = data ? sniffReportFile(data) : null;
    if (!data || !contentType || !job.reportTemplate) {
      throw new NotFoundException('This job has no report template');
    }
    return { data, contentType, fileName: job.reportTemplate.fileName };
  }

  private async assertCanRead(user: AuthUser, startupId: string): Promise<void> {
    if (user.role === 'manager' || user.sub === startupId) return;
    if (user.role === 'specialist') {
      const specialist = await this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { verificationStatus: true },
      });
      if (specialist?.verificationStatus === 'approved') return;
      throw new ForbiddenException(
        'Get verified to download the report template of a job',
      );
    }
    throw new ForbiddenException('This report template belongs to another startup');
  }

  private async openOwnedJob(user: AuthUser, jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { startupId: true, status: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.startupId !== user.sub) {
      throw new ForbiddenException('This job belongs to another startup');
    }
    if (job.status !== 'open') {
      throw new BadRequestException(
        'The report template can only change while the job is open',
      );
    }
  }
}

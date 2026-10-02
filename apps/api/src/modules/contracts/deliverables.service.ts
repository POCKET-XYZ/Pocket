import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth';
import {
  EXTENSIONS,
  sniffAttachment,
  type AttachmentType,
  type UploadedBytes,
} from '../../common/uploads/file-type';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCanView } from './contracts.service';

/** The largest file a delivery report can carry. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** A delivery's file, ready to be sent. */
export interface AttachmentFile {
  data: Buffer;
  contentType: AttachmentType;
  fileName: string;
}

/**
 * The file that backs a delivery's results report: a PDF export or a
 * screenshot of the dashboard. Private to the contract: only its two parties
 * and managers ever read it.
 */
@Injectable()
export class DeliverablesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attach a file to the specialist's latest delivery, replacing the one
   * before, while the startup has not answered it yet. Only a real PDF, PNG,
   * JPEG or WebP is kept, read from its bytes.
   */
  async saveAttachment(
    user: AuthUser,
    deliverableId: string,
    file: UploadedBytes | undefined,
  ) {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      include: { milestone: { include: { contract: true } } },
    });
    if (!deliverable) throw new NotFoundException('Delivery not found');
    const { milestone } = deliverable;
    if (milestone.contract.specialistId !== user.sub) {
      throw new ForbiddenException(
        'Only the hired specialist attaches files to a delivery',
      );
    }
    if (milestone.contract.status !== 'active') {
      throw new BadRequestException('The escrow has to be funded first');
    }
    if (milestone.status !== 'delivered') {
      // Once answered, the startup decided on what it saw: the file stays as it was.
      throw new BadRequestException('The startup already answered this delivery');
    }
    const latest = await this.prisma.deliverable.findFirst({
      where: { milestoneId: milestone.id },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    if (latest?.id !== deliverable.id) {
      throw new BadRequestException('Only the latest delivery takes a file');
    }

    if (!file?.buffer.length) throw new BadRequestException('Choose a file');
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException('The file is too big. The limit is 5 MB');
    }
    const contentType = sniffAttachment(file.buffer);
    if (!contentType) {
      throw new BadRequestException('Attach a PDF, or a PNG, JPEG or WebP image');
    }

    const data = new Uint8Array(file.buffer);
    return this.prisma.deliverableAttachment.upsert({
      where: { deliverableId },
      create: { deliverableId, data, contentType, size: data.length },
      update: { data, contentType, size: data.length },
      select: { contentType: true, size: true, uploadedAt: true },
    });
  }

  /** A delivery's file, for the contract's two parties and managers only. */
  async attachmentOf(user: AuthUser, deliverableId: string): Promise<AttachmentFile> {
    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      select: {
        version: true,
        attachment: { select: { data: true } },
        milestone: {
          select: { contract: { select: { startupId: true, specialistId: true } } },
        },
      },
    });
    if (!deliverable) throw new NotFoundException('Delivery not found');
    // Who may read it is decided before saying whether there is a file at all.
    assertCanView(user, deliverable.milestone.contract);

    const data = deliverable.attachment ? Buffer.from(deliverable.attachment.data) : null;
    // Checked again on the way out: only these types are ever served.
    const contentType = data ? sniffAttachment(data) : null;
    if (!data || !contentType) throw new NotFoundException('This delivery has no file');
    return {
      data,
      contentType,
      fileName: `delivery-v${deliverable.version}.${EXTENSIONS[contentType]}`,
    };
  }
}

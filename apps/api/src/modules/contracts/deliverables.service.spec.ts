import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthUser } from '../../common/types/auth';
import type { PrismaService } from '../../prisma/prisma.service';
import { DOCX_TYPE, XLSX_TYPE } from '../../common/uploads/file-type';
import { docm, docx, xlsm, xlsx } from '../../testing/office-files';
import { DeliverablesService } from './deliverables.service';
import { DeliverDto } from './dto/milestone-actions.dto';

const startup: AuthUser = { sub: 'startup-1', role: 'startup', stellarAddress: 'GS' };
const specialist: AuthUser = {
  sub: 'specialist-1',
  role: 'specialist',
  stellarAddress: 'GP',
};
const manager: AuthUser = { sub: 'manager-1', role: 'manager', stellarAddress: 'GM' };
const outsider: AuthUser = {
  sub: 'specialist-2',
  role: 'specialist',
  stellarAddress: 'GO',
};
const otherStartup: AuthUser = {
  sub: 'startup-2',
  role: 'startup',
  stellarAddress: 'GX',
};

const PDF = Buffer.from('%PDF-1.7 the monthly report');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBPVP8 '),
]);

const file = (bytes: Buffer) => ({ buffer: bytes, size: bytes.length });

function deliverable(milestoneStatus = 'delivered', contractStatus = 'active') {
  return {
    id: 'deliverable-2',
    version: 2,
    milestone: {
      id: 'milestone-1',
      status: milestoneStatus,
      contract: {
        startupId: 'startup-1',
        specialistId: 'specialist-1',
        status: contractStatus,
      },
    },
  };
}

describe('DeliverablesService', () => {
  let prisma: {
    deliverable: { findUnique: jest.Mock; findFirst: jest.Mock };
    deliverableAttachment: { upsert: jest.Mock };
  };
  let service: DeliverablesService;

  beforeEach(() => {
    prisma = {
      deliverable: {
        findUnique: jest.fn().mockResolvedValue(deliverable()),
        // The latest version is the one being attached to.
        findFirst: jest.fn().mockResolvedValue({ id: 'deliverable-2' }),
      },
      deliverableAttachment: {
        upsert: jest.fn(async ({ create }: { create: object }) => create),
      },
    };
    service = new DeliverablesService(prisma as unknown as PrismaService);
  });

  describe('saveAttachment', () => {
    it.each([
      ['a PDF', PDF, 'application/pdf'],
      ['a PNG', PNG, 'image/png'],
      ['a JPEG', JPEG, 'image/jpeg'],
      ['a WebP', WEBP, 'image/webp'],
      ['a filled Excel template', xlsx(true), XLSX_TYPE],
      ['a filled Word template', docx(true), DOCX_TYPE],
      ['a CSV', Buffer.from('KPI,Result\nQualified leads,48\n'), 'text/csv'],
    ])('keeps %s with the type read from its bytes', async (_label, bytes, type) => {
      await service.saveAttachment(specialist, 'deliverable-2', file(bytes));
      expect(prisma.deliverableAttachment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deliverableId: 'deliverable-2' },
          update: expect.objectContaining({ contentType: type, size: bytes.length }),
        }),
      );
    });

    it.each([
      ['an SVG', Buffer.from('<svg><script>alert(1)</script></svg>')],
      [
        'a GIF',
        Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0]),
      ],
      ['a macro-enabled workbook', xlsm()],
      ['a macro-enabled document', docm()],
      ['a page renamed to .pdf', Buffer.from('<html><body>report</body></html>')],
      ['a zip', Buffer.from('PK\u0003\u0004 archive')],
      ['an empty file', Buffer.alloc(0)],
    ])('refuses %s', async (_label, bytes) => {
      await expect(
        service.saveAttachment(specialist, 'deliverable-2', file(bytes)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.deliverableAttachment.upsert).not.toHaveBeenCalled();
    });

    it('refuses a file over 5 MB', async () => {
      const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
      await expect(
        service.saveAttachment(specialist, 'deliverable-2', file(big)),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(prisma.deliverableAttachment.upsert).not.toHaveBeenCalled();
    });

    it.each([
      ['the startup', startup],
      ['another specialist', outsider],
    ])('refuses %s', async (_label, user) => {
      await expect(
        service.saveAttachment(user, 'deliverable-2', file(PDF)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a delivery the startup already answered', async () => {
      prisma.deliverable.findUnique.mockResolvedValue(deliverable('approved'));
      await expect(
        service.saveAttachment(specialist, 'deliverable-2', file(PDF)),
      ).rejects.toThrow('already answered');
    });

    it('refuses an older version of the delivery', async () => {
      prisma.deliverable.findFirst.mockResolvedValue({ id: 'deliverable-3' });
      await expect(
        service.saveAttachment(specialist, 'deliverable-2', file(PDF)),
      ).rejects.toThrow('latest delivery');
    });

    it('answers not found for a delivery that does not exist', async () => {
      prisma.deliverable.findUnique.mockResolvedValue(null);
      await expect(
        service.saveAttachment(specialist, 'nope', file(PDF)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('attachmentOf', () => {
    function stored(bytes: Buffer | null) {
      prisma.deliverable.findUnique.mockResolvedValue({
        version: 2,
        attachment: bytes ? { data: new Uint8Array(bytes) } : null,
        milestone: { contract: { startupId: 'startup-1', specialistId: 'specialist-1' } },
      });
    }

    it.each([
      ['the startup', startup],
      ['the specialist', specialist],
      ['a manager', manager],
    ])('serves the file to %s', async (_label, user) => {
      stored(PDF);
      await expect(service.attachmentOf(user, 'deliverable-2')).resolves.toEqual({
        data: PDF,
        contentType: 'application/pdf',
        fileName: 'delivery-v2.pdf',
      });
    });

    it('names a filled template after its real type, as a download', async () => {
      stored(xlsx());
      await expect(service.attachmentOf(startup, 'deliverable-2')).resolves.toMatchObject(
        { contentType: XLSX_TYPE, fileName: 'delivery-v2.xlsx' },
      );
    });

    it('names an image after its real type', async () => {
      stored(WEBP);
      await expect(service.attachmentOf(startup, 'deliverable-2')).resolves.toMatchObject(
        {
          contentType: 'image/webp',
          fileName: 'delivery-v2.webp',
        },
      );
    });

    it.each([
      ['another startup', otherStartup],
      ['another specialist', outsider],
    ])('refuses %s', async (_label, user) => {
      stored(PDF);
      await expect(service.attachmentOf(user, 'deliverable-2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('does not tell an outsider whether there is a file', async () => {
      stored(null);
      await expect(
        service.attachmentOf(outsider, 'deliverable-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('answers not found when the delivery has no file', async () => {
      stored(null);
      await expect(service.attachmentOf(startup, 'deliverable-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

describe('DeliverDto', () => {
  async function problems(body: object): Promise<number> {
    const errors = await validate(plainToInstance(DeliverDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return errors.length;
  }
  const KPI = '11111111-1111-4111-8111-111111111111';
  const url = 'https://example.com/report';

  it('takes a delivery with results', async () => {
    await expect(
      problems({ url, results: [{ kpiId: KPI, value: '48', comment: 'On track' }] }),
    ).resolves.toBe(0);
  });

  it.each([
    ['a KPI id that is not an id', { kpiId: 'leads', value: '48' }],
    ['an empty result', { kpiId: KPI, value: '' }],
    ['a result too long', { kpiId: KPI, value: 'x'.repeat(121) }],
    ['a comment too long', { kpiId: KPI, value: '48', comment: 'x'.repeat(501) }],
    ['a field nobody asked for', { kpiId: KPI, value: '48', target: '50' }],
  ])('refuses %s', async (_label, result) => {
    await expect(problems({ url, results: [result] })).resolves.toBeGreaterThan(0);
  });
});

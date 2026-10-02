import type { Prisma } from '@prisma/client';

/**
 * What a delivery reported: its KPI results, and whether a file backs them.
 * Only the file's description: its bytes are served on their own route, to
 * the same people, never inside a contract or a dispute.
 */
export const DELIVERABLE_REPORT = {
  kpiResults: true,
  attachment: { select: { contentType: true, size: true, uploadedAt: true } },
} satisfies Prisma.DeliverableInclude;

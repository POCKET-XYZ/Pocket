import type { Prisma } from '@prisma/client';

/**
 * What a job says about its report template: only the file's description.
 * Its bytes are served on their own route, to the people allowed to read it.
 */
export const REPORT_TEMPLATE_INFO = {
  fileName: true,
  contentType: true,
  size: true,
  uploadedAt: true,
} satisfies Prisma.JobReportTemplateSelect;

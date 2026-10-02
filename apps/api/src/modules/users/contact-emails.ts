import type { PrismaClient } from '@prisma/client';

type VerificationReader = Pick<PrismaClient, 'verificationRequest'>;

/**
 * Contact email from each user's approved verification, the newest when there
 * are several. Users never approved are missing from the map.
 */
export async function contactEmails(
  prisma: VerificationReader,
  userIds: string[],
): Promise<Map<string, string>> {
  const requests = await prisma.verificationRequest.findMany({
    where: { userId: { in: userIds }, status: 'approved' },
    orderBy: { submittedAt: 'desc' },
    select: { userId: true, contactEmail: true },
  });
  const emails = new Map<string, string>();
  for (const request of requests) {
    if (!emails.has(request.userId)) emails.set(request.userId, request.contactEmail);
  }
  return emails;
}

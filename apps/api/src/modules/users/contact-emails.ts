import type { PrismaClient } from '@prisma/client';

type VerificationReader = Pick<PrismaClient, 'verificationRequest'>;

/**
 * Contact email from each user's approved or pending verification, the newest
 * when there are several. A pending one counts: a specialist applies and gets
 * offers before their identity check, and is told about them by email. Users
 * who never sent their details are missing from the map.
 */
export async function contactEmails(
  prisma: VerificationReader,
  userIds: string[],
): Promise<Map<string, string>> {
  const requests = await prisma.verificationRequest.findMany({
    where: { userId: { in: userIds }, status: { in: ['approved', 'pending'] } },
    orderBy: { submittedAt: 'desc' },
    select: { userId: true, contactEmail: true },
  });
  const emails = new Map<string, string>();
  for (const request of requests) {
    if (!emails.has(request.userId)) emails.set(request.userId, request.contactEmail);
  }
  return emails;
}

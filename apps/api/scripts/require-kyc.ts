// Asks the accounts approved before identity checks existed to pass one. Each
// approved startup or specialist without a Didit approval goes back to
// pending, with a new request that copies the details it sent, so the person
// only has to verify their identity: the form is already filled in.
//
// Run it once per environment, after its Didit keys are set: without them
// nobody could verify, and the accounts would be stuck. Accounts in the middle
// of a contract with money in it are left alone and listed; run it again once
// those contracts end.
//
//   bun --env-file=.env scripts/require-kyc.ts           # shows who would change
//   bun --env-file=.env scripts/require-kyc.ts --apply   # changes them
import { PrismaClient } from '@prisma/client';

const KYC_VARIABLES = ['DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID', 'DIDIT_WEBHOOK_SECRET'];
const MONEY_IN_PLAY = ['awaiting_funding', 'active'] as const;

async function main(): Promise<void> {
  const missing = KYC_VARIABLES.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Identity checks are off here (missing ${missing.join(', ')}): nobody could verify.`,
    );
  }
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        role: { in: ['startup', 'specialist'] },
        verificationStatus: 'approved',
        verificationRequests: { none: { kycStatus: 'Approved' } },
      },
      select: {
        id: true,
        role: true,
        verificationRequests: { orderBy: { submittedAt: 'desc' }, take: 1 },
      },
    });

    let moved = 0;
    for (const user of users) {
      const party = { OR: [{ startupId: user.id }, { specialistId: user.id }] };
      const busy = await prisma.contract.count({
        where: {
          AND: [
            party,
            {
              OR: [
                { status: { in: [...MONEY_IN_PLAY] } },
                { status: 'awaiting_specialist', acceptedAt: { not: null } },
              ],
            },
          ],
        },
      });
      if (busy > 0) {
        console.log(`skip  ${user.role} ${user.id}: a contract with money in it`);
        continue;
      }

      const last = user.verificationRequests[0];
      console.log(
        `${apply ? 'move ' : 'would'} ${user.role} ${user.id}: ${last ? 'details copied' : 'no details, fills the form again'}`,
      );
      if (!apply) continue;

      await prisma.$transaction(async (tx) => {
        // Only an account still approved moves, in case it changed meanwhile.
        const claimed = await tx.user.updateMany({
          where: { id: user.id, verificationStatus: 'approved' },
          data: { verificationStatus: last ? 'pending' : 'not_submitted' },
        });
        if (claimed.count !== 1 || !last) return;
        await tx.verificationRequest.create({
          data: {
            userId: user.id,
            status: 'pending',
            fullName: last.fullName,
            contactEmail: last.contactEmail,
            country: last.country,
            linkedinUrl: last.linkedinUrl,
            websiteUrl: last.websiteUrl,
            companyName: last.companyName,
            companyRegistrationId: last.companyRegistrationId,
            note: last.note,
          },
        });
      });
      moved += 1;
    }
    console.log(
      apply
        ? `${moved} of ${users.length} accounts now wait for their identity check.`
        : `${users.length} accounts found. Nothing changed: run with --apply.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

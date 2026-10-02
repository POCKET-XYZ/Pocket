/**
 * Seeds Pocket's internal team. Managers cannot sign up through the app: list
 * their Stellar addresses in MANAGER_STELLAR_ADDRESSES (comma-separated). It
 * runs on every Railway deploy right after the migrations, and can be run by
 * hand with `bun run db:seed`. Safe to run repeatedly.
 *
 * The list rules:
 * - Every listed address becomes a manager with an approved verification.
 * - Every manager NOT on the list is demoted: the user row stays (verifications
 *   they reviewed and disputes they resolved point at it), the role becomes
 *   specialist, the verification status becomes rejected and every session
 *   ends. UserRole has no "disabled" value; this is the combination no guard
 *   lets act: no manager route, no marketplace action.
 * - An empty or unset list changes nothing and prints a warning, so a variable
 *   missing on one deploy cannot lock the whole team out.
 * - An invalid address stops the seed before anything is written, which stops
 *   the deploy: the previous one keeps serving.
 */
import { PrismaClient } from '@prisma/client';
import { parseManagerList, syncManagers } from '../src/modules/users/sync-managers';

const prisma = new PrismaClient();

syncManagers(prisma, parseManagerList(process.env.MANAGER_STELLAR_ADDRESSES))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

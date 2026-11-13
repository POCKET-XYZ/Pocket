-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'draft';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "published_at" TIMESTAMP(3);

-- Every job before drafts existed reached the board when it was created.
UPDATE "jobs" SET "published_at" = "created_at";

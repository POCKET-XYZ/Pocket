-- Accounts deleted by their owner, kept only as anonymous records.
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);

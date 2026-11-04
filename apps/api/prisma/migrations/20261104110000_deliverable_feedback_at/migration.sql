-- When the startup asked for changes on a version, for the work history.
-- Requests made before this have none.
ALTER TABLE "deliverables" ADD COLUMN "feedback_at" TIMESTAMP(3);

-- Dates, descriptions or criteria the startup changed after the specialist
-- accepted, until the specialist sees them. Additive: older rows have none.
ALTER TABLE "contracts" ADD COLUMN "pending_changes" JSONB;

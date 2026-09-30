-- Login challenges are found by their nonce instead of by address, so several
-- can be open for the same address: asking for a challenge in someone else's
-- name no longer replaces theirs and locks them out.
--
-- Challenges live five minutes and hold nothing worth keeping; clearing them
-- only means an open login has to ask again.
DELETE FROM "auth_challenges";

-- DropIndex
DROP INDEX "auth_challenges_stellar_address_key";

-- CreateIndex
CREATE UNIQUE INDEX "auth_challenges_nonce_key" ON "auth_challenges"("nonce");

-- CreateIndex
CREATE INDEX "auth_challenges_stellar_address_idx" ON "auth_challenges"("stellar_address");

-- CreateIndex
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges"("expires_at");

-- Accounts are no longer reviewed by hand: completing the details approves
-- them. Whoever was still waiting for a manager is approved now. A Pollar
-- wallet among them is activated on its owner's next sign-in.
UPDATE "verification_requests"
SET "status" = 'approved', "reviewed_at" = NOW()
WHERE "status" = 'pending';

UPDATE "users"
SET "verification_status" = 'approved'
WHERE "verification_status" = 'pending';

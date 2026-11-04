-- Identity checks through Didit: the session behind each verification request
-- and where it stands. Document data and images stay with Didit.
ALTER TABLE "verification_requests"
    ADD COLUMN "kyc_session_id" TEXT,
    ADD COLUMN "kyc_status" TEXT,
    ADD COLUMN "kyc_reason" TEXT,
    ADD COLUMN "kyc_checked_at" TIMESTAMP(3),
    ADD COLUMN "kyc_consent_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "verification_requests_kyc_session_id_key" ON "verification_requests"("kyc_session_id");

-- Proof of consent to the Terms of Service and the Privacy Policy.
ALTER TABLE "users" ADD COLUMN "terms_version" TEXT;
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "terms_accepted_ip" TEXT;

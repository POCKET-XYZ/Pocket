-- Accounts approved on testnet, waiting to be claimed on mainnet by email.
CREATE TABLE "migrated_accounts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "verification" JSONB NOT NULL,
    "profile" JSONB NOT NULL,
    "cv" BYTEA,
    "logo" BYTEA,
    "logo_content_type" TEXT,
    "claimed_by" UUID,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migrated_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "migrated_accounts_email_key" ON "migrated_accounts"("email");
CREATE UNIQUE INDEX "migrated_accounts_claimed_by_key" ON "migrated_accounts"("claimed_by");

-- Only the API reads it: nothing for Supabase's public roles.
ALTER TABLE "migrated_accounts" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "migrated_accounts" FROM anon, authenticated;
    CREATE POLICY deny_public_roles ON "migrated_accounts" AS RESTRICTIVE FOR ALL
      TO anon, authenticated USING (false) WITH CHECK (false);
  ELSE
    CREATE POLICY deny_public_roles ON "migrated_accounts" AS RESTRICTIVE FOR ALL
      TO PUBLIC USING (false) WITH CHECK (false);
  END IF;
END $$;

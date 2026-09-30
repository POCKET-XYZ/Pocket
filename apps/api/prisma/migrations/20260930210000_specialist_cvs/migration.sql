-- CVs uploaded as PDF, one per specialist.
CREATE TABLE "specialist_cvs" (
    "user_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialist_cvs_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "specialist_cvs" ADD CONSTRAINT "specialist_cvs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lockdown as every other table: only the API reaches it.
ALTER TABLE "specialist_cvs" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "specialist_cvs" FROM anon, authenticated;
    CREATE POLICY deny_public_roles ON "specialist_cvs" AS RESTRICTIVE FOR ALL
      TO anon, authenticated USING (false) WITH CHECK (false);
  ELSE
    CREATE POLICY deny_public_roles ON "specialist_cvs" AS RESTRICTIVE FOR ALL
      TO PUBLIC USING (false) WITH CHECK (false);
  END IF;
END $$;

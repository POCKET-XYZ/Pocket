-- Logos uploaded by startups, one per startup. PNG, JPEG or WebP only: the
-- check keeps an SVG or a page out even if the API check were ever skipped.
CREATE TABLE "startup_logos" (
    "user_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "startup_logos_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "startup_logos_content_type_check"
      CHECK ("content_type" IN ('image/png', 'image/jpeg', 'image/webp'))
);

ALTER TABLE "startup_logos" ADD CONSTRAINT "startup_logos_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lockdown as every other table: only the API reaches it.
ALTER TABLE "startup_logos" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "startup_logos" FROM anon, authenticated;
    CREATE POLICY deny_public_roles ON "startup_logos" AS RESTRICTIVE FOR ALL
      TO anon, authenticated USING (false) WITH CHECK (false);
  ELSE
    CREATE POLICY deny_public_roles ON "startup_logos" AS RESTRICTIVE FOR ALL
      TO PUBLIC USING (false) WITH CHECK (false);
  END IF;
END $$;

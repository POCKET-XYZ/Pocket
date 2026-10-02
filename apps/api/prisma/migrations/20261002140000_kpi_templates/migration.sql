-- Named sets of KPIs a startup saves to reuse when posting jobs. The KPIs are
-- an ordered JSON list of { name, target?, unit? }: posting a job copies them,
-- so nothing points at a template. Up to 20 per startup, checked by the API.
CREATE TABLE "kpi_templates" (
    "id" UUID NOT NULL,
    "startup_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kpis" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kpi_templates_startup_id_idx" ON "kpi_templates"("startup_id");

ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_startup_id_fkey"
  FOREIGN KEY ("startup_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lockdown as every other table: only the API reaches it.
ALTER TABLE "kpi_templates" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "kpi_templates" FROM anon, authenticated;
    CREATE POLICY deny_public_roles ON "kpi_templates" AS RESTRICTIVE FOR ALL
      TO anon, authenticated USING (false) WITH CHECK (false);
  ELSE
    CREATE POLICY deny_public_roles ON "kpi_templates" AS RESTRICTIVE FOR ALL
      TO PUBLIC USING (false) WITH CHECK (false);
  END IF;
END $$;

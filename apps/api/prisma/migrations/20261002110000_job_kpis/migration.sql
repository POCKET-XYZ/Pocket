-- What a job's work will be measured on, posted with the job: a name, and an
-- optional target and unit. Up to 10 per job, kept in order.
CREATE TABLE "job_kpis" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "target" TEXT,
    "unit" TEXT,

    CONSTRAINT "job_kpis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_kpis_job_id_position_key" ON "job_kpis"("job_id", "position");

ALTER TABLE "job_kpis" ADD CONSTRAINT "job_kpis_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lockdown as every other table: only the API reaches it.
ALTER TABLE "job_kpis" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "job_kpis" FROM anon, authenticated;
    CREATE POLICY deny_public_roles ON "job_kpis" AS RESTRICTIVE FOR ALL
      TO anon, authenticated USING (false) WITH CHECK (false);
  ELSE
    CREATE POLICY deny_public_roles ON "job_kpis" AS RESTRICTIVE FOR ALL
      TO PUBLIC USING (false) WITH CHECK (false);
  END IF;
END $$;

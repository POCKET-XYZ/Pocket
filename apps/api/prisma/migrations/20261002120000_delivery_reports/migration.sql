-- The results report of a delivery: one row per KPI of the job, per version
-- of the delivery.
CREATE TABLE "deliverable_kpi_results" (
    "id" UUID NOT NULL,
    "deliverable_id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "comment" TEXT,

    CONSTRAINT "deliverable_kpi_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deliverable_kpi_results_deliverable_id_kpi_id_key"
  ON "deliverable_kpi_results"("deliverable_id", "kpi_id");
CREATE INDEX "deliverable_kpi_results_kpi_id_idx" ON "deliverable_kpi_results"("kpi_id");

ALTER TABLE "deliverable_kpi_results" ADD CONSTRAINT "deliverable_kpi_results_deliverable_id_fkey"
  FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deliverable_kpi_results" ADD CONSTRAINT "deliverable_kpi_results_kpi_id_fkey"
  FOREIGN KEY ("kpi_id") REFERENCES "job_kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A file backing the report, one per version of a delivery. PDF, PNG, JPEG or
-- WebP only: the check keeps anything else out even if the API check were
-- ever skipped.
CREATE TABLE "deliverable_attachments" (
    "deliverable_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_attachments_pkey" PRIMARY KEY ("deliverable_id"),
    CONSTRAINT "deliverable_attachments_content_type_check"
      CHECK ("content_type" IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp'))
);

ALTER TABLE "deliverable_attachments" ADD CONSTRAINT "deliverable_attachments_deliverable_id_fkey"
  FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lockdown as every other table: only the API reaches them.
ALTER TABLE "deliverable_kpi_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deliverable_attachments" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['deliverable_kpi_results', 'deliverable_attachments'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      EXECUTE format(
        'CREATE POLICY deny_public_roles ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        t);
    ELSE
      EXECUTE format(
        'CREATE POLICY deny_public_roles ON public.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',
        t);
    END IF;
  END LOOP;
END $$;

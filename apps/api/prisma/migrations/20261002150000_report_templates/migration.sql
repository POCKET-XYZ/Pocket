-- The report template a startup attaches to a job for the specialist to fill
-- in, one per job. PDF, Excel (.xlsx), Word (.docx) or CSV only: the check
-- keeps anything else out even if the API check were ever skipped.
CREATE TABLE "job_report_templates" (
    "job_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "content_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_report_templates_pkey" PRIMARY KEY ("job_id"),
    CONSTRAINT "job_report_templates_content_type_check"
      CHECK ("content_type" IN (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/csv'
      ))
);

ALTER TABLE "job_report_templates" ADD CONSTRAINT "job_report_templates_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A delivery can now carry the template filled in: Excel, Word and CSV join
-- the PDF and the images.
ALTER TABLE "deliverable_attachments"
  DROP CONSTRAINT "deliverable_attachments_content_type_check";
ALTER TABLE "deliverable_attachments"
  ADD CONSTRAINT "deliverable_attachments_content_type_check"
    CHECK ("content_type" IN (
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv'
    ));

-- Same lockdown as every other table: only the API reaches it.
ALTER TABLE "job_report_templates" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "job_report_templates" FROM anon, authenticated;
    CREATE POLICY deny_public_roles ON "job_report_templates" AS RESTRICTIVE FOR ALL
      TO anon, authenticated USING (false) WITH CHECK (false);
  ELSE
    CREATE POLICY deny_public_roles ON "job_report_templates" AS RESTRICTIVE FOR ALL
      TO PUBLIC USING (false) WITH CHECK (false);
  END IF;
END $$;

-- Lock the database down to the API alone, in a migration rather than by hand,
-- so a fresh database (staging, production) starts as closed as this one.
--
-- Pocket never talks to Supabase's Data API: everything goes through the Nest
-- API, which connects as the table owner and is not subject to RLS. So the
-- public roles get nothing: no grants, and RLS with a deny-all policy.

-- 1. Row level security on every table, Prisma's own included.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- 2. On Supabase, take every grant away from the Data API roles, now and for
-- whatever gets created later. Guarded so a plain local Postgres, which has no
-- such roles, still runs this migration.
DO $$
DECLARE t record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

    -- 3. An explicit deny-all policy per table. With no grants it changes
    -- nothing today; it states the intent, and it keeps the tables closed if a
    -- grant ever comes back by mistake.
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('DROP POLICY IF EXISTS deny_public_roles ON public.%I', t.tablename);
      EXECUTE format(
        'CREATE POLICY deny_public_roles ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        t.tablename);
    END LOOP;
  END IF;
END $$;

-- 4. Supabase's automatic-RLS event trigger function is SECURITY DEFINER and
-- executable by everyone. An event trigger function cannot be called directly,
-- so this was never exploitable, but no public role needs it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'rls_auto_enable' AND p.pronamespace = 'public'::regnamespace
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
    END IF;
  END IF;
END $$;

-- 5. Indexes on the foreign keys that had none, as Supabase's performance
-- advisor asks: lookups by who signed, who wrote or who resolved.
CREATE INDEX "chain_operations_signer_id_idx" ON "chain_operations"("signer_id");
CREATE INDEX "dispute_evidence_author_id_idx" ON "dispute_evidence"("author_id");
CREATE INDEX "disputes_opened_by_idx" ON "disputes"("opened_by");
CREATE INDEX "disputes_resolved_by_idx" ON "disputes"("resolved_by");
CREATE INDEX "verification_requests_reviewed_by_idx" ON "verification_requests"("reviewed_by");

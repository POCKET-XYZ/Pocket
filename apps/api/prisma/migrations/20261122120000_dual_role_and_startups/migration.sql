-- One account can be a startup and a specialist (users.roles) and own several
-- startups, acting as one at a time (users.active_startup_id). Each job belongs
-- to one of the account's startups, and each startup has its own logo.
-- Additive for every row there is today: each account keeps its one startup,
-- now its active one, and each job and logo points to it.

-- Every role an account has. Testnet already has this column from an earlier
-- branch, hence IF NOT EXISTS.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[];

-- An account may own several startups.
DROP INDEX "startup_profiles_user_id_key";
CREATE INDEX "startup_profiles_user_id_idx" ON "startup_profiles"("user_id");

-- The startup an account acts as: the one it has today.
ALTER TABLE "users" ADD COLUMN "active_startup_id" UUID;
UPDATE "users" AS u SET "active_startup_id" = sp."id"
  FROM "startup_profiles" AS sp WHERE sp."user_id" = u."id";
ALTER TABLE "users" ADD CONSTRAINT "users_active_startup_id_fkey" FOREIGN KEY ("active_startup_id") REFERENCES "startup_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Which startup each job is for: the one its account has today.
ALTER TABLE "jobs" ADD COLUMN "startup_profile_id" UUID;
UPDATE "jobs" AS j SET "startup_profile_id" = sp."id"
  FROM "startup_profiles" AS sp WHERE sp."user_id" = j."startup_id";
CREATE INDEX "jobs_startup_profile_id_idx" ON "jobs"("startup_profile_id");
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_startup_profile_id_fkey" FOREIGN KEY ("startup_profile_id") REFERENCES "startup_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Logos move from the account to its startup. A logo on an account with no
-- startup profile was shown nowhere and is dropped.
ALTER TABLE "startup_logos" ADD COLUMN "startup_profile_id" UUID;
UPDATE "startup_logos" AS l SET "startup_profile_id" = sp."id"
  FROM "startup_profiles" AS sp WHERE sp."user_id" = l."user_id";
DELETE FROM "startup_logos" WHERE "startup_profile_id" IS NULL;
ALTER TABLE "startup_logos" DROP CONSTRAINT "startup_logos_user_id_fkey";
ALTER TABLE "startup_logos" DROP CONSTRAINT "startup_logos_pkey";
ALTER TABLE "startup_logos" DROP COLUMN "user_id";
ALTER TABLE "startup_logos" ALTER COLUMN "startup_profile_id" SET NOT NULL;
ALTER TABLE "startup_logos" ADD CONSTRAINT "startup_logos_pkey" PRIMARY KEY ("startup_profile_id");
ALTER TABLE "startup_logos" ADD CONSTRAINT "startup_logos_startup_profile_id_fkey" FOREIGN KEY ("startup_profile_id") REFERENCES "startup_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An uploaded logo is served by its startup now: /profiles/<startup id>/logo.
UPDATE "startup_profiles"
  SET "logo_url" = replace("logo_url", '/profiles/' || "user_id"::text || '/logo', '/profiles/' || "id"::text || '/logo')
  WHERE strpos("logo_url", '/profiles/' || "user_id"::text || '/logo') > 0;

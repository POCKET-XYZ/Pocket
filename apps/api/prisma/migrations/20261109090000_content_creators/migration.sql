-- Content creators: a category of their own, and on the specialist profile
-- their social accounts with the figures they declare, their niches and
-- where their audience is. Only adds: nothing existing changes.
ALTER TYPE "ServiceCategory" ADD VALUE 'content';

ALTER TABLE "specialist_profiles" ADD COLUMN     "audience_countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "niches" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "social_accounts" JSONB NOT NULL DEFAULT '[]';

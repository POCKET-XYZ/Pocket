-- A session version per user. Every access token carries the version it was
-- issued under; bumping it ends all of that user's sessions at once.
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

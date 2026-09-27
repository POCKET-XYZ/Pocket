-- Pollar wallets: a user can now arrive with a wallet they hold themselves or
-- with one Pollar creates for them after a social or email login.
CREATE TYPE "WalletCustody" AS ENUM ('external', 'pollar');

-- Everyone registered so far signed a challenge with their own wallet.
ALTER TABLE "users" ADD COLUMN     "wallet_custody" "WalletCustody" NOT NULL DEFAULT 'external',
ADD COLUMN     "wallet_provider" TEXT,
ADD COLUMN     "pollar_user_id" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "wallet_funded_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_pollar_user_id_key" ON "users"("pollar_user_id");

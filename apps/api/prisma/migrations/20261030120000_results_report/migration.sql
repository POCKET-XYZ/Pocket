-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('more_is_better', 'less_is_better');

-- CreateEnum
CREATE TYPE "PayoutRecipient" AS ENUM ('specialist', 'startup', 'pocket', 'trustless_work', 'other');

-- AlterTable
ALTER TABLE "job_kpis" ADD COLUMN     "direction" "KpiDirection",
ADD COLUMN     "target_value" DECIMAL(20,7);

-- AlterTable
ALTER TABLE "deliverable_kpi_results" ADD COLUMN     "numeric_value" DECIMAL(20,7);

-- AlterTable
ALTER TABLE "chain_operations" ADD COLUMN     "payouts_read_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "chain_payouts" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "recipient" "PayoutRecipient" NOT NULL,
    "address" TEXT NOT NULL,
    "amount" DECIMAL(20,7) NOT NULL,

    CONSTRAINT "chain_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chain_payouts_operation_id_idx" ON "chain_payouts"("operation_id");

-- AddForeignKey
ALTER TABLE "chain_payouts" ADD CONSTRAINT "chain_payouts_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "chain_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A numeric target always says which way is better, and a direction never
-- comes without a target. KPIs posted before keep their text target only.
ALTER TABLE "job_kpis" ADD CONSTRAINT "job_kpis_target_value_direction_check"
  CHECK (("target_value" IS NULL) = ("direction" IS NULL));

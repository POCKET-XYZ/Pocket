-- Pocket's fee each escrow was deployed with, in basis points (100 = 1%).
-- The escrow takes it from every payout, so the metrics read it per contract.
ALTER TABLE "contracts" ADD COLUMN "platform_fee_bps" INTEGER NOT NULL DEFAULT 0;

-- Pocket's 1% fee shipped on 2026-10-02 around 16:19 UTC. Escrows deployed
-- after that carry 1%; the ones deployed before it charge nothing. A contract
-- is accepted the moment its escrow is deployed, so accepted_at marks the
-- deploy. Contracts with no escrow keep 0 until theirs is deployed.
UPDATE "contracts" SET "platform_fee_bps" = 100
WHERE "escrow_id" IS NOT NULL AND "accepted_at" >= '2026-10-02 16:19:00';

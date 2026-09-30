-- Keep the record of every signed transaction when its contract or milestone
-- is deleted: the platform monitor alerts on platform transactions it cannot
-- find here, and the history is the audit trail of what the key signed.
ALTER TABLE "chain_operations" DROP CONSTRAINT "chain_operations_contract_id_fkey";
ALTER TABLE "chain_operations" DROP CONSTRAINT "chain_operations_milestone_id_fkey";

ALTER TABLE "chain_operations" ADD CONSTRAINT "chain_operations_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chain_operations" ADD CONSTRAINT "chain_operations_milestone_id_fkey"
  FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Users can send USDC from their wallet to another Stellar address. Pocket
-- builds that transaction too, so it is recorded like every other one.
ALTER TYPE "ChainOperationKind" ADD VALUE 'payment';

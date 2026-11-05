import type { ChainOperationKind, ContractDetail } from '@pocket/shared';

/**
 * How long a step sent to the network is waited for. Past this it most likely
 * stopped halfway, and the screen offers it again: the API refuses a second
 * one while the first can still land, and frees the step once it cannot.
 */
export const STEP_STUCK_MS = 2 * 60 * 1000;

/**
 * Whether a deploy, deposit or approval was already sent for this contract
 * (or milestone), on this page or before a reload: `sending` while the
 * network may still confirm it, `stuck` once it took too long, `none` if not.
 */
export function sentStep(
  contract: ContractDetail,
  kind: ChainOperationKind,
  milestoneId: string | null,
  now: number,
): 'none' | 'sending' | 'stuck' {
  const operation = contract.chainOperations.find(
    (each) =>
      each.kind === kind && (milestoneId === null || each.milestoneId === milestoneId),
  );
  if (!operation) return 'none';
  const sentAt = operation.confirmedAt ? Date.parse(operation.confirmedAt) : now;
  return now - sentAt < STEP_STUCK_MS ? 'sending' : 'stuck';
}

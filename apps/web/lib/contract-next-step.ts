import type { ContractSummary, User } from '@pocket/shared';

/** What the signed-in user has to do next on a contract, if anything. */
export function nextStep(contract: ContractSummary, user: User): string | null {
  const isStartup = user.role === 'startup';
  if (contract.status === 'awaiting_specialist')
    return isStartup ? null : 'Revisa los términos';
  if (contract.status === 'awaiting_funding')
    return isStartup ? 'Deposita el pago en el contrato' : null;
  if (contract.status !== 'active') return null;
  const statuses = contract.milestones.map((milestone) => milestone.status);
  if (isStartup && statuses.includes('delivered')) return 'Revisa una entrega';
  if (!isStartup && statuses.some((s) => s === 'pending' || s === 'changes_requested'))
    return 'Entrega un hito';
  return null;
}

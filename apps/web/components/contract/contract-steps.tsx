import type { ContractDetail, User } from '@pocket/shared';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The four steps every contract goes through, as each side reads them. */
const STEPS = {
  specialist: [
    'Aceptas los términos',
    'La startup deposita el pago',
    'Entregas cada hito y recibes su pago al aprobarse',
    'Contrato completado',
  ],
  startup: [
    'El experto acepta los términos',
    'Depositas el pago',
    'El experto entrega cada hito y tú lo apruebas',
    'Contrato completado',
  ],
  other: [
    'El experto acepta los términos',
    'La startup deposita el pago',
    'Entregas y pagos por hito',
    'Contrato completado',
  ],
} as const;

/** Where the contract is in its four steps: done ones checked, the current one marked. */
export function ContractSteps({
  contract,
  user,
}: {
  contract: ContractDetail;
  user: User;
}) {
  if (contract.status === 'cancelled') return null;
  const labels =
    user.id === contract.specialistId
      ? STEPS.specialist
      : user.id === contract.startupId
        ? STEPS.startup
        : STEPS.other;
  const current =
    contract.status === 'awaiting_specialist'
      ? 0
      : contract.status === 'awaiting_funding'
        ? 1
        : contract.status === 'active'
          ? 2
          : labels.length;
  const settled = contract.milestones.filter((milestone) =>
    ['paid', 'resolved'].includes(milestone.status),
  ).length;

  return (
    <ol
      aria-label="Pasos del contrato"
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4"
    >
      {labels.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'later';
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            className="flex items-start gap-2"
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-sm',
                state === 'done' && 'bg-navy text-off-white',
                state === 'current' && 'bg-celeste font-semibold text-navy',
                state === 'later' && 'border border-border text-muted-foreground',
              )}
            >
              {state === 'done' ? (
                <CheckIcon className="size-4" aria-label="Listo" />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                'text-sm',
                state === 'later' ? 'text-muted-foreground' : 'text-navy',
                state === 'current' && 'font-semibold',
              )}
            >
              {label}
              {index === 2 && state === 'current' ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  {settled} de {contract.milestones.length}{' '}
                  {contract.milestones.length === 1 ? 'hito pagado' : 'hitos pagados'}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

import type { SigningStage } from '@/lib/wallet';

/** The button's text while a money step runs. */
export function stageLabel(stage: SigningStage, sending: string): string {
  if (stage === 'preparing') return 'Preparando...';
  if (stage === 'signing') return 'Confirma en tu wallet...';
  return sending;
}

/**
 * What is happening while a money step runs, and what not to do: the wallet
 * waits for a signature, or the network is confirming.
 */
export function MoneyStepStatus({
  stage,
  slow,
  sending,
}: {
  stage: SigningStage | null;
  slow: boolean;
  /** What the network is doing, for example "Liberando el pago al experto." */
  sending: string;
}) {
  if (stage === null || stage === 'preparing') return null;
  return (
    <div className="w-full space-y-1 rounded-lg bg-celeste-light/50 px-3 py-2 text-sm text-navy">
      {stage === 'signing' ? (
        <p>
          Confirma la transacción en tu wallet. Si no ves la ventana, revisa si se abrió
          detrás de esta.
        </p>
      ) : (
        <>
          <p>
            {sending} Suele tardar menos de un minuto.{' '}
            <strong>No cierres ni recargues esta página hasta que termine.</strong>
          </p>
          {slow ? (
            <p className="text-muted-foreground">
              Está tardando más de lo normal. Si la página se cierra, vuelve a abrir el
              contrato: verás en qué quedó, y no se cobra dos veces.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

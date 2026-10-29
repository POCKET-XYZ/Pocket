'use client';

import type { User, WalletStatus } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSigner } from '@/components/use-signer';
import { api, errorMessage } from '@/lib/api';
import { isWalletDismissed, prepareSignSubmit } from '@/lib/wallet';

export type UsdcReadiness = WalletStatus['usdc'];

const IS_TESTNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'mainnet';

/**
 * XLM under which the wallet is about to run out of network fees. A step of an
 * escrow costs a fraction of a cent, so this is still dozens of signatures
 * away from empty: the warning has to arrive before the failure does.
 */
const LOW_FEE_XLM = 0.02;

export function useUsdcStatus(enabled = true) {
  return useQuery({
    queryKey: ['wallet', 'usdc'],
    queryFn: () => api<WalletStatus>('/wallet/usdc'),
    enabled,
    staleTime: 10_000,
  });
}

/**
 * What the wallet still needs before it can send or receive USDC, with the
 * one-click fix. Renders nothing once the wallet is ready, unless `showReady`.
 */
export function UsdcStatus({
  user,
  showReady = false,
}: {
  user: User;
  showReady?: boolean;
}) {
  const queryClient = useQueryClient();
  const status = useUsdcStatus();
  const signer = useSigner();

  const enable = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        signer.sign,
        { kind: 'usdc-trustline' },
        '/wallet/usdc-trustline/prepare',
        '/wallet/usdc-trustline/submit',
      ),
    onSuccess: async () => {
      toast.success('USDC quedó habilitado en tu wallet');
      await queryClient.invalidateQueries({ queryKey: ['wallet', 'usdc'] });
    },
    onError: (error) => {
      if (!isWalletDismissed(error)) toast.error(errorMessage(error));
    },
  });

  if (!status.data) return null;

  const outOfFees =
    status.data.xlmForFees !== null && Number(status.data.xlmForFees) < LOW_FEE_XLM;

  // Nothing can be signed without it, so this comes before the USDC notices.
  if (outOfFees) {
    return (
      <Alert variant="destructive">
        <AlertTitle>
          Tu wallet se está quedando sin XLM para las comisiones de red
        </AlertTitle>
        <AlertDescription>
          <p>
            Cada paso del contrato que firmas paga una pequeña comisión en XLM, y a tu
            wallet le quedan {status.data.xlmForFees}. Recárgala antes de depositar,
            aprobar o abrir una disputa, o esos pasos van a fallar.
          </p>
          {IS_TESTNET ? (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <a
                href={`https://friendbot.stellar.org?addr=${user.stellarAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                Obtener XLM gratis de la red de pruebas
              </a>
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (status.data.usdc === 'ready') {
    return showReady ? (
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>Tu wallet está lista para USDC</AlertTitle>
        <AlertDescription>
          {IS_TESTNET ? (
            <span>
              ¿Necesitas USDC de prueba? Consíguelos gratis en{' '}
              <a
                className="underline"
                href="https://faucet.circle.com"
                target="_blank"
                rel="noreferrer"
              >
                faucet.circle.com
              </a>{' '}
              (red de pruebas de Stellar).
            </span>
          ) : (
            'Puedes enviar y recibir USDC.'
          )}
        </AlertDescription>
      </Alert>
    ) : null;
  }

  if (status.data.usdc === 'no_account') {
    // A wallet Pocket created through Pollar is activated when a manager
    // approves the account, so there is nothing for the user to do but wait.
    if (user.walletCustody === 'pollar') {
      return (
        <Alert className="border-yellow bg-yellow/15">
          <AlertTitle>Tu wallet se está activando</AlertTitle>
          <AlertDescription>
            Pocket activa tu wallet en la red Stellar una vez que se aprueba tu cuenta.
            Toma unos segundos y no tienes que pagar nada.
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="destructive">
        <AlertTitle>Tu wallet todavía no está activa en Stellar</AlertTitle>
        <AlertDescription>
          <p>Una cuenta de Stellar necesita un poco de XLM antes de existir en la red.</p>
          {IS_TESTNET ? (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <a
                href={`https://friendbot.stellar.org?addr=${user.stellarAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                Obtener XLM gratis de la red de pruebas
              </a>
            </Button>
          ) : (
            // 1 XLM opens the account and 0.5 more holds the USDC trustline;
            // the rest pays network fees.
            <p className="mt-2">
              Envía al menos 3 XLM a la dirección de tu wallet desde un exchange u otra
              wallet, por la red Stellar. No hace falta memo.
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-yellow bg-yellow/15">
      <AlertTitle>Habilita USDC en tu wallet</AlertTitle>
      <AlertDescription>
        <p>
          Tu wallet tiene que habilitar USDC antes de poder depositar en un contrato o
          recibir un pago. Se hace una sola vez
          {user.walletCustody === 'pollar'
            ? ', y Pocket cubre su costo.'
            : ', y cuesta una pequeña comisión de red.'}
        </p>
        <Button
          size="sm"
          className="mt-3"
          disabled={enable.isPending}
          onClick={() => enable.mutate()}
        >
          {enable.isPending ? 'Habilitando...' : 'Habilitar USDC'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

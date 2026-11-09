'use client';

import type { User, WalletStatus } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
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

/**
 * XLM a wallet needs to enable USDC on its own: the 0.5 XLM the trustline
 * locks, plus the fee of that one transaction.
 */
const TRUSTLINE_XLM = 0.51;

/** How many times a wallet not on the network yet is asked about again: two minutes. */
const MAX_ACTIVATION_POLLS = 12;

export function useUsdcStatus(enabled = true) {
  return useQuery({
    queryKey: ['wallet', 'usdc'],
    queryFn: () => api<WalletStatus>('/wallet/usdc'),
    enabled,
    staleTime: 10_000,
    // Pocket activates a Pollar wallet on sign-in, in the background: ask
    // again until it shows up, so the page moves on by itself. Its own rate
    // limit on the API, so this never blocks accepting or funding.
    refetchInterval: (query) =>
      query.state.data?.usdc === 'no_account' &&
      query.state.dataUpdateCount < MAX_ACTIVATION_POLLS
        ? 10_000
        : false,
  });
}

/**
 * Make sure a Pollar wallet takes USDC before a step that needs it (accepting
 * a contract, depositing): USDC is enabled right there, in the same click,
 * instead of the step being refused. A wallet the user holds is left as it
 * is, and the API says what it is missing.
 */
export function useEnsureUsdc(): () => Promise<void> {
  const signer = useSigner();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    if (signer.kind !== 'pollar' || !signer.ready) return;
    const read = () =>
      queryClient.fetchQuery({
        queryKey: ['wallet', 'usdc'],
        queryFn: () => api<WalletStatus>('/wallet/usdc'),
        staleTime: 0,
      });
    if ((await read()).usdc !== 'no_trustline') return;
    try {
      await prepareSignSubmit(
        signer.sign,
        { kind: 'usdc-trustline' },
        '/wallet/usdc-trustline/prepare',
        '/wallet/usdc-trustline/submit',
      );
    } catch (error) {
      // The notice on the page may have enabled it a moment before.
      if ((await read()).usdc !== 'ready') throw error;
    }
    await queryClient.invalidateQueries({ queryKey: ['wallet', 'usdc'] });
  }, [signer, queryClient]);
}

/**
 * What the wallet still needs before it can send or receive USDC, with the
 * one-click fix. Renders nothing once the wallet is ready, unless `showReady`.
 *
 * A wallet created through Pollar belongs to someone who should never hear of
 * XLM: nothing here mentions it to them. Its USDC is enabled on its own, and
 * a wallet short of XLM is the Pocket team's problem (the API alerts it), not
 * the user's. A wallet the user holds keeps every detail, since its owner
 * manages it.
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
  const throughPollar = user.walletCustody === 'pollar';

  const enable = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        signer.sign,
        { kind: 'usdc-trustline' },
        '/wallet/usdc-trustline/prepare',
        '/wallet/usdc-trustline/submit',
      ),
    onSuccess: async () => {
      // A Pollar wallet was enabled without asking: there is nothing to announce.
      if (!throughPollar) toast.success('USDC quedó habilitado en tu wallet');
      await queryClient.invalidateQueries({ queryKey: ['wallet', 'usdc'] });
    },
    onError: (error) => {
      if (!throughPollar && !isWalletDismissed(error)) toast.error(errorMessage(error));
    },
  });

  // A Pollar wallet that can pay for its trustline gets it on its own, once
  // per visit, as soon as its signer is ready.
  const autoEnabled = useRef(false);
  const canEnableAlone =
    throughPollar &&
    signer.ready &&
    status.data?.usdc === 'no_trustline' &&
    Number(status.data.xlmForFees ?? 0) >= TRUSTLINE_XLM;
  const { mutate: enableUsdc } = enable;
  useEffect(() => {
    if (!canEnableAlone || autoEnabled.current) return;
    autoEnabled.current = true;
    enableUsdc();
  }, [canEnableAlone, enableUsdc]);

  if (!status.data) return null;

  if (throughPollar && status.data.usdc === 'no_trustline') {
    return (
      <Alert className="border-warning bg-warning/15">
        <AlertTitle>Estamos preparando tu wallet para recibir USDC</AlertTitle>
        <AlertDescription>
          {enable.isError ? (
            <>
              <p>No se pudo terminar de prepararla. Inténtalo de nuevo en un momento.</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={enable.isPending}
                onClick={() => enable.mutate()}
              >
                {enable.isPending ? 'Preparando...' : 'Reintentar'}
              </Button>
            </>
          ) : (
            <p>
              Toma unos segundos y no tienes que hacer nada. Si tarda, el equipo de Pocket
              ya está avisado y lo resuelve por ti.
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const outOfFees =
    status.data.xlmForFees !== null && Number(status.data.xlmForFees) < LOW_FEE_XLM;

  // Nothing can be signed without it, so this comes before the USDC notices.
  // Never shown for a Pollar wallet: the API alerts the Pocket team instead.
  if (outOfFees && !throughPollar) {
    return (
      <Alert variant="destructive">
        <AlertTitle>
          Tu wallet se está quedando sin XLM para las comisiones de red
        </AlertTitle>
        <AlertDescription>
          <p>
            Cada paso del contrato que firmas paga una pequeña comisión en XLM, y a tu
            wallet le quedan {status.data.xlmForFees}. Recárgala antes de{' '}
            {/* Each side signs different steps: name only the ones this one signs. */}
            {user.role === 'startup'
              ? 'depositar, aprobar o abrir una disputa'
              : 'habilitar USDC o abrir una disputa'}
            , o esos pasos van a fallar.
          </p>
          {IS_TESTNET ? null : (
            <p className="mt-2">
              Envía 1 XLM o más a la dirección de tu wallet desde un exchange u otra
              wallet, por la red Stellar. No hace falta memo.
              {status.data.usdc === 'ready'
                ? ''
                : ' Cuando llegue, habilita USDC aquí mismo.'}
            </p>
          )}
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
    // A wallet Pocket created through Pollar is activated, at Pocket's cost,
    // as soon as the person signs in: there is nothing for them to do but wait.
    if (throughPollar) {
      return (
        <Alert className="border-warning bg-warning/15">
          <AlertTitle>Tu wallet se está activando</AlertTitle>
          <AlertDescription>
            Pocket ya la está activando. Toma unos segundos y no tienes que pagar nada.
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
    <Alert className="border-warning bg-warning/15">
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

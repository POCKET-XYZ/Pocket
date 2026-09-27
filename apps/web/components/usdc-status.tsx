'use client';

import type { User } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSigner } from '@/components/use-signer';
import { api, errorMessage } from '@/lib/api';
import { isWalletDismissed, prepareSignSubmit } from '@/lib/wallet';

export type UsdcReadiness = 'ready' | 'no_account' | 'no_trustline';

const IS_TESTNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'mainnet';

export function useUsdcStatus(enabled = true) {
  return useQuery({
    queryKey: ['wallet', 'usdc'],
    queryFn: () => api<{ address: string; usdc: UsdcReadiness }>('/wallet/usdc'),
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
        '/wallet/usdc-trustline/prepare',
        '/wallet/usdc-trustline/submit',
      ),
    onSuccess: async () => {
      toast.success('USDC is enabled in your wallet');
      await queryClient.invalidateQueries({ queryKey: ['wallet', 'usdc'] });
    },
    onError: (error) => {
      if (!isWalletDismissed(error)) toast.error(errorMessage(error));
    },
  });

  if (!status.data) return null;

  if (status.data.usdc === 'ready') {
    return showReady ? (
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>Your wallet is ready for USDC</AlertTitle>
        <AlertDescription>
          {IS_TESTNET ? (
            <span>
              Need test USDC? Get it free at{' '}
              <a
                className="underline"
                href="https://faucet.circle.com"
                target="_blank"
                rel="noreferrer"
              >
                faucet.circle.com
              </a>{' '}
              (Stellar testnet).
            </span>
          ) : (
            'You can send and receive USDC.'
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
          <AlertTitle>Your wallet is being activated</AlertTitle>
          <AlertDescription>
            Pocket puts your wallet on the Stellar network once your account is approved.
            It takes a few seconds, and you do not need to pay anything.
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="destructive">
        <AlertTitle>Your wallet is not active on Stellar yet</AlertTitle>
        <AlertDescription>
          <p>A Stellar account needs a little XLM before it exists on the network.</p>
          {IS_TESTNET ? (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <a
                href={`https://friendbot.stellar.org?addr=${user.stellarAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                Get free testnet XLM
              </a>
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-yellow bg-yellow/15">
      <AlertTitle>Enable USDC in your wallet</AlertTitle>
      <AlertDescription>
        <p>
          Your wallet has to trust USDC before it can fund an escrow or receive a payment.
          It is a one-time step
          {user.walletCustody === 'pollar'
            ? ', and Pocket covers its cost.'
            : ', and it costs a small network fee.'}
        </p>
        <Button
          size="sm"
          className="mt-3"
          disabled={enable.isPending}
          onClick={() => enable.mutate()}
        >
          {enable.isPending ? 'Enabling...' : 'Enable USDC'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

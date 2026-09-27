'use client';

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { usePollarSession } from '@/components/pollar-session';
import { signXdr as signWithWallet, type SignXdr } from '@/lib/wallet';

export interface Signer {
  /** Whether a wallet is in place to sign right now. */
  ready: boolean;
  /** Which wallet signs: the one Pollar holds, or the user's own extension. */
  kind: 'pollar' | 'wallet';
  sign: SignXdr;
}

/**
 * Who signs the escrow steps of the signed-in user. Pocket has two doors, and
 * both end in a signature from the address that holds the escrow role: a wallet
 * the user connected signs in the extension, and a wallet reached through
 * Pollar signs on Pollar's side, which also pays the network fee.
 *
 * A Pollar session for the same address is preferred over the extension, so a
 * user who came in with Freighter through Pollar keeps the sponsored fee.
 */
export function useSigner(): Signer {
  const { user } = useAuth();
  const pollar = usePollarSession();
  const address = user?.stellarAddress;
  const signWithPollar = pollar.ready && pollar.address === address;

  const sign = useCallback<SignXdr>(
    (xdr, networkPassphrase) => {
      if (signWithPollar) return pollar.signXdr(xdr);
      if (!address) {
        return Promise.reject(new Error('Sign in before signing a transaction'));
      }
      return signWithWallet(xdr, address, networkPassphrase);
    },
    [signWithPollar, pollar, address],
  );

  return useMemo(
    () => ({
      // The extension is asked for its signature when the action runs, so a
      // wallet session is ready as soon as there is an address to sign with.
      ready: signWithPollar || Boolean(address),
      kind: signWithPollar ? 'pollar' : 'wallet',
      sign,
    }),
    [signWithPollar, address, sign],
  );
}

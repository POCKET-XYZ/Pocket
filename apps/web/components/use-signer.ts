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
 * Pollar signs on Pollar's side.
 *
 * The account remembers which one it is, so a Pollar account whose session
 * expired is sent back to Pollar instead of being shown a wallet picker for an
 * extension it never had.
 */
export function useSigner(): Signer {
  const { user } = useAuth();
  const pollar = usePollarSession();
  const address = user?.stellarAddress;
  const belongsToPollar = user?.walletCustody === 'pollar';
  const pollarReady = pollar.ready && pollar.address === address;

  const sign = useCallback<SignXdr>(
    (xdr, networkPassphrase) => {
      if (pollarReady) return pollar.signXdr(xdr);
      if (belongsToPollar) {
        // Opening the login here means the user can sign in and press the same
        // button again, instead of hunting for where to reconnect.
        pollar.openLogin();
        return Promise.reject(
          new Error('Your Pollar session expired. Sign in again and try once more'),
        );
      }
      if (!address) {
        return Promise.reject(new Error('Sign in before signing a transaction'));
      }
      return signWithWallet(xdr, address, networkPassphrase);
    },
    [pollarReady, belongsToPollar, pollar, address],
  );

  return useMemo(
    () => ({
      // The extension is asked for its signature when the action runs, so a
      // wallet session is ready as soon as there is an address to sign with.
      ready: pollarReady || (!belongsToPollar && Boolean(address)),
      kind: belongsToPollar || pollarReady ? 'pollar' : 'wallet',
      sign,
    }),
    [pollarReady, belongsToPollar, address, sign],
  );
}

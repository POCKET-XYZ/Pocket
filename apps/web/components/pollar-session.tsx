'use client';

import { PollarProvider as PollarSdkProvider, usePollar } from '@pollar/react';
import '@pollar/react/styles.css';
import { createContext, useCallback, useContext, useMemo } from 'react';

/** How the wallet of a Pollar session is held. */
export type PollarCustody = 'internal' | 'external' | 'smart';

/** One asset the wallet holds, as Pollar reports it. */
export interface PollarBalance {
  code: string;
  /** Decimal string, or null while Pollar has no answer for it. */
  balance: string | null;
}

export interface PollarSession {
  /** Whether Pocket was built with a Pollar key at all. */
  available: boolean;
  /** A session that can sign: logged in and confirmed by Pollar's server. */
  ready: boolean;
  address: string | null;
  custody: PollarCustody | null;
  /** google, github, email, freighter-native... */
  provider: string | null;
  /** Read at call time: the token is refreshed behind our back. */
  getAccessToken: () => string | null;
  /** Open Pollar's login modal: social, email or a wallet. */
  openLogin: () => void;
  signOut: () => void;
  /**
   * Sign a transaction with the Pollar wallet and return the signed XDR, ready
   * for Pocket to broadcast through Trustless Work.
   */
  signXdr: (xdr: string) => Promise<string>;
  /** What the wallet holds, or null until it is loaded. */
  balances: PollarBalance[] | null;
  balancesLoading: boolean;
  /** Load or reload the balances. */
  refreshBalances: () => Promise<void>;
  /** Pollar's own screens: balances, address with QR, history, fiat ramp. */
  openBalance: () => void;
  openReceive: () => void;
  openHistory: () => void;
  openRamp: () => void;
}

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY;
const NETWORK =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

/** What the app sees when Pocket runs without a Pollar key. */
const UNAVAILABLE: PollarSession = {
  available: false,
  ready: false,
  address: null,
  custody: null,
  provider: null,
  getAccessToken: () => null,
  openLogin: () => {},
  signOut: () => {},
  balances: null,
  balancesLoading: false,
  refreshBalances: () => Promise.resolve(),
  signXdr: () =>
    Promise.reject(new Error('Pollar is not configured in this deployment')),
  openBalance: () => {},
  openReceive: () => {},
  openHistory: () => {},
  openRamp: () => {},
};

const PollarSessionContext = createContext<PollarSession>(UNAVAILABLE);

/**
 * Pollar's SDK, mounted once around the app. Without a publishable key the tree
 * renders untouched and Pocket only offers wallet sign-in, so a deployment
 * without Pollar keeps working.
 */
export function PollarSessionProvider({ children }: { children: React.ReactNode }) {
  if (!PUBLISHABLE_KEY) return <>{children}</>;

  return (
    <PollarSdkProvider client={{ apiKey: PUBLISHABLE_KEY, stellarNetwork: NETWORK }}>
      <PollarSessionBridge>{children}</PollarSessionBridge>
    </PollarSdkProvider>
  );
}

function PollarSessionBridge({ children }: { children: React.ReactNode }) {
  const {
    wallet,
    verified,
    isAuthenticated,
    getClient,
    logout,
    openLoginModal,
    openWalletBalanceModal,
    openReceiveModal,
    openTxHistoryModal,
    openRampModal,
    walletBalance,
    refreshWalletBalance,
  } = usePollar();

  const getAccessToken = useCallback(() => {
    const state = getClient().getAuthState();
    return state.step === 'authenticated' ? state.session.token.accessToken : null;
  }, [getClient]);

  const signXdr = useCallback(
    async (xdr: string) => {
      // Sponsorship is turned down on purpose. With it, Pollar answers with the
      // signed transaction wrapped in a fee bump paid by the app, and Trustless
      // Work refuses a fee bump on its send endpoint with "Bad request". The
      // wallet pays its own fee instead, which is a fraction of a cent and comes
      // out of the XLM Pollar gives every new wallet.
      const outcome = await getClient().signTx(xdr, { skipSponsorship: true });
      if (outcome.status !== 'signed') {
        throw new Error(
          outcome.message ?? outcome.details ?? 'Pollar could not sign this transaction',
        );
      }
      return outcome.signedXdr;
    },
    [getClient],
  );

  const value = useMemo<PollarSession>(
    () => ({
      available: true,
      // Signing is gated on `verified`: a session restored from storage is only
      // a guess until Pollar's server confirms it.
      ready: Boolean(isAuthenticated && verified && wallet?.address),
      address: wallet?.address ?? null,
      custody: (wallet?.custody as PollarCustody | undefined) ?? null,
      provider: wallet?.provider ?? null,
      getAccessToken,
      openLogin: openLoginModal,
      signOut: logout,
      signXdr,
      balances:
        walletBalance.step === 'loaded'
          ? walletBalance.data.balances.map((asset) => ({
              code: asset.code,
              balance: asset.balance,
            }))
          : null,
      balancesLoading: walletBalance.step === 'loading',
      refreshBalances: refreshWalletBalance,
      openBalance: openWalletBalanceModal,
      openReceive: openReceiveModal,
      openHistory: openTxHistoryModal,
      openRamp: openRampModal,
    }),
    [
      isAuthenticated,
      verified,
      wallet?.address,
      wallet?.custody,
      wallet?.provider,
      getAccessToken,
      openLoginModal,
      logout,
      signXdr,
      walletBalance,
      refreshWalletBalance,
      openWalletBalanceModal,
      openReceiveModal,
      openTxHistoryModal,
      openRampModal,
    ],
  );

  return (
    <PollarSessionContext.Provider value={value}>{children}</PollarSessionContext.Provider>
  );
}

/** The Pollar session, safe to call anywhere: it reports itself unavailable. */
export function usePollarSession(): PollarSession {
  return useContext(PollarSessionContext);
}

'use client';

import type { ChallengeResponse, LoginResponse, SignUpRole, User } from '@pocket/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePollarSession } from '@/components/pollar-session';
import { ApiError, api, getToken, setToken, subscribeToken } from '@/lib/api';
import { connectWallet, signXdr } from '@/lib/wallet';

type Status = 'loading' | 'signed-out' | 'signed-in';

/**
 * The first sign-in of a new wallet, waiting for the user to pick a role. A
 * wallet sign-in keeps its signature so the wallet is not asked twice; a Pollar
 * sign-in only needs the session, which is already open.
 */
type PendingSignUp =
  | { via: 'wallet'; stellarAddress: string; signedXdr: string }
  | { via: 'pollar'; stellarAddress: string };

interface AuthContextValue {
  status: Status;
  user: User | null;
  pendingSignUp: PendingSignUp | null;
  /** Connect a wallet and sign the login challenge. */
  signIn: () => Promise<void>;
  /** Open Pollar's login: social, email or a wallet, with no challenge to sign. */
  signInWithPollar: () => void;
  /** Whether Pollar sign-in is available in this deployment. */
  pollarAvailable: boolean;
  /** What went wrong while turning a Pollar session into a Pocket one. */
  pollarError: unknown;
  /** Finish a first sign-in by choosing startup or specialist. */
  chooseRole: (role: SignUpRole) => Promise<void>;
  cancelSignUp: () => void;
  signOut: () => void;
  /** Reload the user, for example after a manager approved them. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ME = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const pollar = usePollarSession();
  const [pendingSignUp, setPendingSignUp] = useState<PendingSignUp | null>(null);
  // A failure while picking up a Pollar session has no click to report to, so it
  // is kept here for the connect screen to show.
  const [pollarError, setPollarError] = useState<unknown>(null);
  // The token lives in localStorage: undefined while rendering on the server.
  const token = useSyncExternalStore(subscribeToken, getToken, () => undefined);

  const me = useQuery({
    queryKey: ME,
    queryFn: () => api<User>('/users/me'),
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
    // A manager can approve an account at any moment, and until the client
    // notices, the whole marketplace stays locked. While the account is not
    // approved, ask often, so the approval opens the app on its own.
    refetchInterval: (query) =>
      query.state.data && query.state.data.verificationStatus !== 'approved'
        ? 15_000
        : false,
    refetchIntervalInBackground: false,
  });

  // Coming back to the tab is the other moment an approval may have landed.
  useEffect(() => {
    if (!token) return;
    const onFocus = () => void queryClient.invalidateQueries({ queryKey: ME });
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [token, queryClient]);

  // An expired or revoked token signs the user out.
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) setToken(null);
  }, [me.error]);

  const status: Status =
    token === undefined || (token && me.isPending)
      ? 'loading'
      : token && me.data
        ? 'signed-in'
        : 'signed-out';

  const finishLogin = useCallback(
    (response: LoginResponse) => {
      queryClient.clear();
      queryClient.setQueryData(ME, response.user);
      setPendingSignUp(null);
      setToken(response.accessToken);
    },
    [queryClient],
  );

  const signIn = useCallback(async () => {
    const { address } = await connectWallet();
    const challenge = await api<ChallengeResponse>('/auth/challenge', {
      method: 'POST',
      body: { stellarAddress: address },
    });
    const signedXdr = await signXdr(challenge.xdr, address, challenge.networkPassphrase);
    try {
      finishLogin(
        await api<LoginResponse>('/auth/login', {
          method: 'POST',
          body: { stellarAddress: address, signedXdr },
        }),
      );
    } catch (error) {
      // A wallet Pocket has never seen: ask for the role, then resend the same signature.
      if (error instanceof ApiError && error.code === 'ROLE_REQUIRED') {
        setPendingSignUp({ via: 'wallet', stellarAddress: address, signedXdr });
        return;
      }
      throw error;
    }
  }, [finishLogin]);

  /**
   * Turn the open Pollar session into a Pocket one. Pollar already proved who
   * the user is, so this only trades its token for Pocket's.
   */
  const loginWithPollar = useCallback(
    async (role?: SignUpRole) => {
      const accessToken = pollar.getAccessToken();
      if (!accessToken || !pollar.address) return;
      try {
        finishLogin(
          await api<LoginResponse>('/auth/pollar', {
            method: 'POST',
            body: { accessToken, ...(role ? { role } : {}) },
          }),
        );
      } catch (error) {
        // An account Pocket has never seen: ask for the role and come back.
        if (error instanceof ApiError && error.code === 'ROLE_REQUIRED') {
          setPendingSignUp({ via: 'pollar', stellarAddress: pollar.address });
          return;
        }
        throw error;
      }
    },
    [pollar, finishLogin],
  );

  // Pollar signs the user in through its own modal, so the session appears
  // without Pocket asking. Pick it up once, as soon as Pollar confirms it.
  const claimed = useRef(false);
  useEffect(() => {
    if (!pollar.ready || token || pendingSignUp) return;
    if (claimed.current) return;
    claimed.current = true;
    void loginWithPollar().catch((error: unknown) => {
      claimed.current = false;
      setPollarError(error);
    });
  }, [pollar.ready, token, pendingSignUp, loginWithPollar]);

  const chooseRole = useCallback(
    async (role: SignUpRole) => {
      if (!pendingSignUp) return;
      if (pendingSignUp.via === 'pollar') {
        await loginWithPollar(role);
        return;
      }
      finishLogin(
        await api<LoginResponse>('/auth/login', {
          method: 'POST',
          body: {
            stellarAddress: pendingSignUp.stellarAddress,
            signedXdr: pendingSignUp.signedXdr,
            role,
          },
        }),
      );
    },
    [pendingSignUp, finishLogin, loginWithPollar],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setPendingSignUp(null);
    setPollarError(null);
    claimed.current = false;
    if (pollar.ready) pollar.signOut();
    queryClient.clear();
  }, [queryClient, pollar]);

  const refreshUser = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ME });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: status === 'signed-in' ? (me.data ?? null) : null,
      pendingSignUp,
      signIn,
      signInWithPollar: pollar.openLogin,
      pollarAvailable: pollar.available,
      pollarError,
      chooseRole,
      cancelSignUp: () => {
        setPendingSignUp(null);
        if (pollar.ready) pollar.signOut();
      },
      signOut,
      refreshUser,
    }),
    [
      status,
      me.data,
      pendingSignUp,
      signIn,
      pollar,
      pollarError,
      chooseRole,
      signOut,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

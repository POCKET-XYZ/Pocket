'use client';

import { isAccountActive, type KycSettings, type User } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Whether accounts are activated by an identity check through Didit. False
 * while the answer loads, and wherever Didit is not set up: then completing
 * the account details activates the account.
 */
export function useKycEnabled(enabled = true): boolean {
  return useKycSettings(enabled).data?.enabled === true;
}

/** The identity check settings as the API reports them, with their loading state. */
export function useKycSettings(enabled = true) {
  return useQuery({
    queryKey: ['verification', 'kyc'],
    queryFn: () => api<KycSettings>('/verification/kyc'),
    staleTime: Infinity,
    // Only for a signed-in user: the API answers nobody else.
    enabled,
  });
}

type Account = Pick<User, 'role' | 'verificationStatus'>;

/**
 * Whether the identity check is what is left to activate this account. A
 * specialist never waits on it: their details activate the account, and the
 * identity check comes when they accept a contract.
 */
function identityNext(kyc: boolean, user: Account): boolean {
  return kyc && user.role !== 'specialist';
}

/** What is left to activate an account, in one sentence. */
export function activationHint(kyc: boolean, user: Account): string {
  if (!identityNext(kyc, user)) {
    return kyc
      ? 'Un formulario corto, sin documentos. Al enviarlo tu cuenta queda activa. Tu identidad la verificas cuando aceptes tu primer contrato.'
      : 'Un formulario corto, sin documentos. Al enviarlo tu cuenta queda activa.';
  }
  if (user.verificationStatus === 'pending') {
    return 'Falta verificar tu identidad con tu documento y una selfie. Toma unos minutos.';
  }
  return 'Completa tus datos y verifica tu identidad con tu documento y una selfie. Toma unos minutos.';
}

/** The button that takes the user to the next step of activating their account. */
export function activationAction(kyc: boolean, user: Account): string {
  if (identityNext(kyc, user) && user.verificationStatus === 'pending') {
    return 'Verificar mi identidad';
  }
  return 'Completar mis datos';
}

/**
 * The account's status as its badge shows it: a specialist waiting for the
 * identity check is already active.
 */
export function accountBadgeStatus(user: Account): string {
  return user.verificationStatus === 'pending' && isAccountActive(user)
    ? 'active'
    : user.verificationStatus;
}

/** Why a specialist verifies their identity, where accepting a contract needs it. */
export const IDENTITY_FOR_CONTRACT =
  'Antes de aceptar tu primer contrato, Pocket verifica tu identidad con tu documento y una selfie. Toma unos minutos y se hace una sola vez.';

'use client';

import type { KycSettings, VerificationStatus } from '@pocket/shared';
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

/** What is left to activate an account, in one sentence. */
export function activationHint(kyc: boolean, status: VerificationStatus): string {
  if (!kyc)
    return 'Un formulario corto, sin documentos. Al enviarlo tu cuenta queda activa.';
  if (status === 'pending') {
    return 'Falta verificar tu identidad con tu documento y una selfie. Toma unos minutos.';
  }
  return 'Completa tus datos y verifica tu identidad con tu documento y una selfie. Toma unos minutos.';
}

/** The button that takes the user to the next step of activating their account. */
export function activationAction(kyc: boolean, status: VerificationStatus): string {
  if (kyc && status === 'pending') return 'Verificar mi identidad';
  return 'Completar mis datos';
}

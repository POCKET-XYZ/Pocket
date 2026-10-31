'use client';

import { LEGAL_VERSION } from '@pocket/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { PRIVACY_EMAIL } from '@/components/legal-page';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

/** The two separate consents Pocket needs, both given by the user's own action. */
export interface Consent {
  terms: boolean;
  data: boolean;
}

export const NO_CONSENT: Consent = { terms: false, data: false };

export function consentGiven(consent: Consent): boolean {
  return consent.terms && consent.data;
}

function Box({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-navy"
      />
      <span>{children}</span>
    </label>
  );
}

/**
 * Acceptance of the Terms and, separately, consent to the processing of
 * personal data, as several Latin American laws ask. Never ticked in advance,
 * with the short privacy notice next to them.
 */
export function TermsConsent({
  value,
  onChange,
  className,
}: {
  value: Consent;
  onChange: (value: Consent) => void;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <Box checked={value.terms} onChange={(terms) => onChange({ ...value, terms })}>
        Tengo 18 años o más y acepto los{' '}
        <Link href="/terms" target="_blank" className="underline">
          Términos de Servicio
        </Link>
        .
      </Box>
      <Box checked={value.data} onChange={(data) => onChange({ ...value, data })}>
        Doy mi consentimiento para que Pocket trate mis datos personales como lo describe
        la{' '}
        <Link href="/privacy" target="_blank" className="underline">
          Política de Privacidad
        </Link>
        , incluido publicar mi perfil y mi CV cuando mi cuenta esté activa, y guardar mis
        datos en Estados Unidos.
      </Box>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Pocket usa tu dirección de wallet, tu correo, los datos de tu cuenta y tu perfil
        para operar tu cuenta, publicar tu perfil y manejar los contratos en la red
        pública de Stellar. Tus datos se guardan en Estados Unidos. Puedes ejercer tus
        derechos, o limitar el uso de tus datos, desde tu página de cuenta o en{' '}
        {PRIVACY_EMAIL}.
      </p>
    </div>
  );
}

/**
 * Stops a signed-in user who has not accepted the current version, so every
 * account in use has a record of consent to the text in force.
 */
export function TermsGate() {
  const { user, refreshUser, signOut } = useAuth();
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent>(NO_CONSENT);
  const [saving, setSaving] = useState(false);

  // The documents, and the way out, stay reachable.
  if (!user || user.termsVersion === LEGAL_VERSION) return null;
  if (['/terms', '/privacy', '/account'].some((path) => pathname.startsWith(path))) {
    return null;
  }

  async function accept() {
    setSaving(true);
    try {
      await api('/users/me/terms', { method: 'POST', body: { version: LEGAL_VERSION } });
      await refreshUser();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-6 shadow-xl">
        <h2
          id="terms-gate-title"
          className="font-heading text-xl font-semibold text-navy"
        >
          {user.termsVersion ? 'Actualizamos nuestros términos' : 'Antes de seguir'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Lee los Términos de Servicio y la Política de Privacidad, y acéptalos para
          seguir usando Pocket. Si no quieres, puedes{' '}
          <Link href="/account" className="underline">
            descargar tus datos o eliminar tu cuenta
          </Link>
          .
        </p>
        <TermsConsent value={consent} onChange={setConsent} className="mt-5" />
        <div className="mt-6 flex gap-2">
          <Button
            disabled={!consentGiven(consent) || saving}
            onClick={() => void accept()}
          >
            {saving ? 'Guardando...' : 'Aceptar y seguir'}
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Links to the legal documents and to the user's data, on every page. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground md:px-6">
        <span>
          {process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
            ? 'Pocket. Funciona en la red principal de Stellar, con USDC real.'
            : 'Pocket. Funciona en la red de pruebas de Stellar: el USDC no tiene valor.'}
        </span>
        <nav className="flex flex-wrap gap-4">
          <Link href="/terms" className="hover:text-navy">
            Términos de Servicio
          </Link>
          <Link href="/privacy" className="hover:text-navy">
            Política de Privacidad
          </Link>
          <Link href="/account" className="hover:text-navy">
            Tu cuenta y tus datos
          </Link>
        </nav>
      </div>
    </footer>
  );
}

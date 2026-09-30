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
        I am 18 or older and I accept the{' '}
        <Link href="/terms" target="_blank" className="underline">
          Terms of Service
        </Link>
        .
      </Box>
      <Box checked={value.data} onChange={(data) => onChange({ ...value, data })}>
        I consent to Pocket processing my personal data as the{' '}
        <Link href="/privacy" target="_blank" className="underline">
          Privacy Policy
        </Link>{' '}
        describes, including publishing my profile and CV once I am verified, and storing my
        data in the United States.
      </Box>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Pocket uses your wallet address, email, verification and profile data to run your
        account, verify you, publish your profile and run escrows on the public Stellar
        blockchain. Your data is stored in the United States. You can use your rights, or limit
        the use of your data, from your account page or at {PRIVACY_EMAIL}.
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
  if (['/terms', '/privacy', '/account'].includes(pathname)) return null;

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
        <h2 id="terms-gate-title" className="font-heading text-xl font-semibold text-navy">
          {user.termsVersion ? 'Our terms changed' : 'Before you go on'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Please read the Terms of Service and the Privacy Policy, and accept them to keep using
          Pocket. If you do not want to, you can{' '}
          <Link href="/account" className="underline">
            download your data or delete your account
          </Link>
          .
        </p>
        <TermsConsent value={consent} onChange={setConsent} className="mt-5" />
        <div className="mt-6 flex gap-2">
          <Button disabled={!consentGiven(consent) || saving} onClick={() => void accept()}>
            {saving ? 'Saving...' : 'Accept and continue'}
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Sign out
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
        <span>Pocket. Runs on the Stellar test network.</span>
        <nav className="flex flex-wrap gap-4">
          <Link href="/terms" className="hover:text-navy">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-navy">
            Privacy Policy
          </Link>
          <Link href="/account" className="hover:text-navy">
            Your account and data
          </Link>
        </nav>
      </div>
    </footer>
  );
}

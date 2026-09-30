'use client';

import type { SignUpRole, User } from '@pocket/shared';
import { BriefcaseBusinessIcon, MailIcon, RocketIcon, WalletIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page';
import { NO_CONSENT, TermsConsent, consentGiven, type Consent } from '@/components/terms';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { isWalletDismissed } from '@/lib/wallet';
import { cn } from '@/lib/utils';

const ROLES: {
  value: SignUpRole;
  title: string;
  text: string;
  icon: typeof RocketIcon;
}[] = [
  {
    value: 'startup',
    title: 'I am a startup',
    text: 'Post jobs, hire specialists and pay per milestone through escrow.',
    icon: RocketIcon,
  },
  {
    value: 'specialist',
    title: 'I am a specialist',
    text: 'Apply to jobs in growth, sales and marketing, and get paid in USDC.',
    icon: BriefcaseBusinessIcon,
  },
];

/** Where a user lands after signing in. */
function homeFor(user: User): string {
  if (user.role === 'manager') return '/manager/verifications';
  if (user.verificationStatus !== 'approved') return '/verification';
  return user.role === 'startup' ? '/dashboard' : '/jobs';
}

export default function ConnectPage() {
  const {
    status,
    user,
    pendingSignUp,
    signIn,
    signInWithPollar,
    pollarAvailable,
    pollarError,
    chooseRole,
    cancelSignUp,
  } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<SignUpRole | null>(null);
  const [consent, setConsent] = useState<Consent>(NO_CONSENT);

  useEffect(() => {
    if (status === 'signed-in' && user) router.replace(homeFor(user));
  }, [status, user, router]);

  // Pollar signs the user in through its own modal, so a failure on the way
  // back has no button to report to.
  useEffect(() => {
    if (pollarError) toast.error(errorMessage(pollarError));
  }, [pollarError]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      if (!isWalletDismissed(error)) toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (pendingSignUp) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Create your account"
          description="Choose how you will use Pocket. Your wallet is your account, and this cannot be changed later."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {ROLES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRole(option.value)}
              className={cn(
                'rounded-2xl border-2 bg-card p-6 text-left transition hover:border-celeste',
                role === option.value ? 'border-navy' : 'border-border',
              )}
            >
              <option.icon className="size-7 text-navy" />
              <p className="mt-4 font-heading text-xl font-semibold text-navy">
                {option.title}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{option.text}</p>
            </button>
          ))}
        </div>
        <TermsConsent value={consent} onChange={setConsent} className="mt-6" />
        <div className="mt-4 flex gap-2">
          <Button
            size="lg"
            disabled={!role || !consentGiven(consent) || busy}
            onClick={() => role && run(() => chooseRole(role))}
          >
            Create account
          </Button>
          <Button size="lg" variant="ghost" onClick={cancelSignUp}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-navy text-yellow">
        <WalletIcon className="size-8" />
      </div>
      <h1 className="mt-6 text-3xl font-bold text-navy">Sign in to Pocket</h1>
      <p className="mt-3 text-muted-foreground">
        Your Stellar wallet is your account. Bring your own, or let Pocket create one for
        you. Either way you keep control of your money: every payment is signed by your
        wallet and Pocket never holds your funds.
      </p>

      {pollarAvailable ? (
        <div className="mt-8 space-y-3 text-left">
          <button
            type="button"
            onClick={signInWithPollar}
            className="flex w-full items-start gap-4 rounded-2xl border-2 border-border bg-card p-5 text-left transition hover:border-celeste"
          >
            <MailIcon className="mt-1 size-6 shrink-0 text-navy" />
            <span>
              <span className="block font-heading text-lg font-semibold text-navy">
                Continue with email, Google or GitHub
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Recommended if you are new to crypto. You get a Stellar wallet ready to
                receive USDC, with no extension to install, no seed phrase and no network
                fees to pay.
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(signIn)}
            className="flex w-full items-start gap-4 rounded-2xl border-2 border-border bg-card p-5 text-left transition hover:border-celeste disabled:opacity-60"
          >
            <WalletIcon className="mt-1 size-6 shrink-0 text-navy" />
            <span>
              <span className="block font-heading text-lg font-semibold text-navy">
                {busy ? 'Waiting for your wallet...' : 'Connect my Stellar wallet'}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Freighter, xBull, Lobstr, Albedo and others. You sign a message to prove
                the wallet is yours. It costs nothing and moves no funds.
              </span>
            </span>
          </button>
        </div>
      ) : (
        <Button
          size="lg"
          className="mt-8 h-11 px-6"
          disabled={busy}
          onClick={() => run(signIn)}
        >
          {busy ? 'Waiting for your wallet...' : 'Connect wallet'}
        </Button>
      )}
    </div>
  );
}

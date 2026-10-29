'use client';

import type { SignUpRole } from '@pocket/shared';
import { BriefcaseBusinessIcon, MailIcon, RocketIcon, WalletIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { isWalletDismissed } from '@/lib/wallet';
import { cn } from '@/lib/utils';
import { homeFor } from '@/lib/home';

const ROLES: {
  value: SignUpRole;
  title: string;
  text: string;
  icon: typeof RocketIcon;
}[] = [
  {
    value: 'startup',
    title: 'Soy startup',
    text: 'Publica trabajos, contrata expertos y paga por hito, con el dinero guardado en un contrato.',
    icon: RocketIcon,
  },
  {
    value: 'specialist',
    title: 'Soy experto',
    text: 'Postúlate a trabajos de growth, ventas y marketing, y cobra en USDC.',
    icon: BriefcaseBusinessIcon,
  },
];

export default function LoginPage() {
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
  // The landing's "Soy startup" / "Soy experto" buttons link here with ?role=.
  // The role picker only shows after sign-in, so reading it here never
  // changes what the server rendered.
  const [role, setRole] = useState<SignUpRole | null>(() => {
    if (typeof window === 'undefined') return null;
    const wanted = new URLSearchParams(window.location.search).get('role');
    return ROLES.find((option) => option.value === wanted)?.value ?? null;
  });

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
          title="Crea tu cuenta"
          description="Elige cómo vas a usar Pocket. Tu wallet es tu cuenta, y esta elección no se puede cambiar después."
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
        <div className="mt-6 flex gap-2">
          <Button
            size="lg"
            disabled={!role || busy}
            onClick={() => role && run(() => chooseRole(role))}
          >
            Crear cuenta
          </Button>
          <Button size="lg" variant="ghost" onClick={cancelSignUp}>
            Cancelar
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
      <h1 className="mt-6 text-3xl font-bold text-navy">Entra a Pocket</h1>
      <p className="mt-3 text-muted-foreground">
        Tu wallet de Stellar es tu cuenta. Usa la tuya o deja que Pocket te cree una. En
        los dos casos tú controlas tu dinero: cada pago lo firma tu wallet y Pocket nunca
        tiene tus fondos en su poder.
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
                Continuar con correo o Google
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Recomendado si es tu primera vez con cripto. Obtienes una wallet de
                Stellar lista para recibir USDC, sin instalar extensiones, sin frase
                semilla y sin pagar comisiones de red.
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
                {busy ? 'Esperando tu wallet...' : 'Conectar mi wallet de Stellar'}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Freighter, xBull, Lobstr, Albedo y otras. Firmas un mensaje para demostrar
                que la wallet es tuya. No cuesta nada y no mueve fondos.
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
          {busy ? 'Esperando tu wallet...' : 'Conectar wallet'}
        </Button>
      )}
    </div>
  );
}

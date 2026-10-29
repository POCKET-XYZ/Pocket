'use client';

import type { SpecialistProfile, StartupProfile, User } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type StepState = 'done' | 'current' | 'later';

interface Step {
  title: string;
  text: string;
  state: StepState;
  action?: { label: string; href: string };
}

/**
 * What a new startup or specialist has to do before they can use the
 * marketplace, and which step they are on. It disappears once they are set up.
 *
 * Completing the account details approves the account on the spot, so every
 * step is in the user's hands.
 */
export function Onboarding({ className }: { className?: string }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const approved = user?.verificationStatus === 'approved';

  const profile = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => api<StartupProfile | SpecialistProfile | null>('/profiles/me'),
    enabled: Boolean(user) && approved,
  });

  if (!user || user.role === 'manager') return null;
  // Do not guess the profile step while it is still loading.
  if (approved && profile.isLoading) return null;

  const hasProfile = Boolean(profile.data);
  if (approved && hasProfile) return null;

  const steps = stepsFor(user, hasProfile);

  return (
    <Card className={cn('border-celeste bg-celeste-light/30', className)}>
      <CardContent className="pt-6">
        <h2 className="font-heading text-lg font-semibold text-navy">
          Primeros pasos en Pocket
        </h2>
        <ol className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-wrap items-center gap-3">
              <StepMark state={step.state} number={index + 1} />
              <div className="min-w-56 flex-1">
                <p
                  className={cn(
                    'font-medium',
                    step.state === 'later' ? 'text-muted-foreground' : 'text-navy',
                  )}
                >
                  {step.title}
                </p>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
              {/* No button to the page you are already on: the form is right below. */}
              {step.action && step.state !== 'later' && step.action.href !== pathname ? (
                <Button
                  asChild
                  size="sm"
                  variant={step.state === 'current' ? 'default' : 'outline'}
                >
                  <Link href={step.action.href}>{step.action.label}</Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function stepsFor(user: User, hasProfile: boolean): Step[] {
  const approved = user.verificationStatus === 'approved';
  const isStartup = user.role === 'startup';

  const verification: Step = {
    title: 'Completa los datos de tu cuenta',
    text: approved
      ? 'Tu cuenta está activa.'
      : 'Un formulario corto, sin documentos. Al enviarlo tu cuenta queda activa.',
    state: approved ? 'done' : 'current',
    action: approved
      ? undefined
      : { label: 'Completar mis datos', href: '/verification' },
  };

  const profile: Step = {
    title: isStartup
      ? 'Completa el perfil de tu startup'
      : 'Completa tu perfil de experto',
    text: isStartup
      ? 'Qué hace tu empresa, en qué etapa está y en qué necesitas ayuda. Los expertos lo ven en tus trabajos.'
      : 'Tu titular, tus fortalezas, tus categorías y tu tarifa. Las startups lo miran para elegir.',
    state: !approved ? 'later' : hasProfile ? 'done' : 'current',
    action: { label: hasProfile ? 'Editar perfil' : 'Crear perfil', href: '/profile' },
  };

  const first: Step = {
    title: isStartup ? 'Publica tu primer trabajo' : 'Postúlate a un trabajo',
    text: isStartup
      ? 'Describe el trabajo y el presupuesto. Los expertos se postularán y tú eliges a uno.'
      : 'Los trabajos abiertos están en la sección Trabajos. Postúlate con tu propuesta, tu precio y cuánto tiempo te toma.',
    state: approved && hasProfile ? 'current' : 'later',
    action: isStartup
      ? { label: 'Publicar un trabajo', href: '/jobs/new' }
      : { label: 'Ver trabajos', href: '/jobs' },
  };

  return [verification, profile, first];
}

function StepMark({ state, number }: { state: StepState; number: number }) {
  const base = 'flex size-7 shrink-0 items-center justify-center rounded-full text-sm';
  if (state === 'done') {
    return (
      <span className={cn(base, 'bg-navy text-off-white')} aria-label="Listo">
        <CheckIcon className="size-4" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        state === 'current'
          ? 'bg-celeste font-semibold text-navy'
          : 'border border-border bg-card text-muted-foreground',
      )}
    >
      {number}
    </span>
  );
}

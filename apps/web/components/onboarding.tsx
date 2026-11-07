'use client';

import type {
  ContractSummary,
  JobListing,
  MyApplication,
  SpecialistProfile,
  StartupProfile,
  User,
} from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activationAction, activationHint, useKycEnabled } from '@/components/activation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { HOW_IT_WORKS_URL } from '@/lib/home';
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
 * With `full`, on the home panel, it follows them through their first contract
 * and disappears when that is done. Every step is read from the real state.
 *
 * Activating the account takes the account details and, when Didit is set
 * up, an identity check: every step is in the user's hands.
 */
export function Onboarding({
  className,
  full = false,
}: {
  className?: string;
  full?: boolean;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const approved = user?.verificationStatus === 'approved';
  const isStartup = user?.role === 'startup';
  const kyc = useKycEnabled(Boolean(user) && !approved);

  const profile = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => api<StartupProfile | SpecialistProfile | null>('/profiles/me'),
    enabled: Boolean(user) && approved,
  });

  const contracts = useQuery({
    queryKey: ['contracts', 'mine'],
    queryFn: () => api<ContractSummary[]>('/contracts/mine'),
    enabled: full && Boolean(user) && user?.role !== 'manager',
  });
  const jobs = useQuery({
    queryKey: ['jobs', 'mine'],
    queryFn: () => api<JobListing[]>('/jobs/mine'),
    enabled: full && isStartup,
  });
  const applications = useQuery({
    queryKey: ['applications', 'mine'],
    queryFn: () => api<MyApplication[]>('/applications/mine'),
    enabled: full && user?.role === 'specialist',
  });

  if (!user || user.role === 'manager') return null;
  // Do not guess a step while what it depends on is still loading.
  if (approved && profile.isLoading) return null;
  if (full && (contracts.isLoading || jobs.isLoading || applications.isLoading)) {
    return null;
  }

  const hasProfile = Boolean(profile.data);
  if (!full && approved && hasProfile) return null;

  const steps = stepsFor(
    user,
    hasProfile,
    kyc,
    full
      ? {
          contracts: contracts.data ?? [],
          hasStarted: isStartup
            ? (jobs.data?.length ?? 0) > 0
            : (applications.data?.length ?? 0) > 0,
        }
      : null,
  );
  const doneSteps = steps.filter((step) => step.state === 'done').length;
  if (doneSteps === steps.length) return null;

  return (
    <Card className={cn('border-celeste bg-celeste-light/30', className)}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-bold text-navy">
            Primeros pasos en Pocket
          </h2>
          {full ? (
            <span className="shrink-0 text-sm text-muted-foreground">
              {doneSteps} de {steps.length}
            </span>
          ) : null}
        </div>
        {full ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" aria-hidden>
            <div
              className="h-full rounded-full bg-navy"
              style={{ width: `${(doneSteps / steps.length) * 100}%` }}
            />
          </div>
        ) : null}
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
              {/* On the panel a finished step has nothing left to offer. */}
              {step.action &&
              step.state !== 'later' &&
              !(full && step.state === 'done') &&
              step.action.href !== pathname ? (
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
        {full ? (
          <a
            href={HOW_IT_WORKS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-sm text-muted-foreground underline hover:text-navy"
          >
            ¿Cómo funciona Pocket?
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The first contract, for the steps that only the home panel shows. */
interface Progress {
  contracts: ContractSummary[];
  hasStarted: boolean;
}

function stepsFor(
  user: User,
  hasProfile: boolean,
  kyc: boolean,
  progress: Progress | null,
): Step[] {
  const approved = user.verificationStatus === 'approved';
  const isStartup = user.role === 'startup';
  const milestones = (progress?.contracts ?? []).flatMap(
    (contract) => contract.milestones,
  );
  const anyMilestone = (...statuses: string[]) =>
    milestones.some((milestone) => statuses.includes(milestone.status));
  const paid = anyMilestone('paid', 'resolved');
  const toFund = progress?.contracts.find(
    (contract) => contract.status === 'awaiting_funding',
  );
  const funded = (progress?.contracts ?? []).some((contract) =>
    ['active', 'completed'].includes(contract.status),
  );

  const steps: (Omit<Step, 'state'> & { done: boolean })[] = [
    {
      title: kyc ? 'Activa tu cuenta' : 'Completa los datos de tu cuenta',
      text: approved
        ? 'Tu cuenta está activa.'
        : activationHint(kyc, user.verificationStatus),
      done: approved,
      action: approved
        ? undefined
        : {
            label: activationAction(kyc, user.verificationStatus),
            href: '/verification',
          },
    },
    {
      title: isStartup
        ? 'Completa el perfil de tu startup'
        : 'Completa tu perfil de experto',
      text: isStartup
        ? 'Qué hace tu empresa, en qué etapa está y en qué necesitas ayuda. Los expertos lo ven en tus trabajos.'
        : 'Tu titular, tus fortalezas, tus categorías y tu tarifa. Las startups lo miran para elegir.',
      done: hasProfile,
      action: { label: hasProfile ? 'Editar perfil' : 'Crear perfil', href: '/profile' },
    },
    {
      title: isStartup ? 'Publica tu primer trabajo' : 'Postúlate a un trabajo',
      text: isStartup
        ? 'Describe el trabajo y el presupuesto. Los expertos se postularán y tú eliges a uno.'
        : 'Los trabajos abiertos están en la sección Trabajos. Postúlate con tu propuesta, tu precio y cuánto tiempo te toma.',
      done: Boolean(progress?.hasStarted) || milestones.length > 0,
      // On the panel, the empty state right below already has this button.
      action: progress
        ? undefined
        : isStartup
          ? { label: 'Publicar un trabajo', href: '/jobs/new' }
          : { label: 'Ver trabajos', href: '/jobs' },
    },
  ];

  if (progress) {
    steps.push(
      ...(isStartup
        ? [
            {
              title: 'Guarda el pago en el contrato',
              text: 'Cuando el experto acepta, depositas el pago. Queda guardado hasta que apruebes cada hito.',
              done: funded,
              action: toFund
                ? { label: 'Depositar', href: `/contracts/${toFund.id}` }
                : undefined,
            },
            {
              title: 'Aprueba la primera entrega',
              text: 'Al aprobar un hito, su pago se libera al experto.',
              done: paid,
            },
          ]
        : [
            {
              title: 'Haz tu primera entrega',
              text: 'Cuando una startup te contrata y deposita el pago, entregas cada hito desde el contrato.',
              done: anyMilestone(
                'delivered',
                'changes_requested',
                'approved',
                'paid',
                'disputed',
                'resolved',
              ),
            },
            {
              title: 'Recibe tu primer pago',
              text: 'Cuando la startup aprueba un hito, su pago llega a tu wallet.',
              done: paid,
            },
          ]),
    );
  }

  const current = steps.findIndex((step) => !step.done);
  return steps.map(({ done, ...step }, index) => ({
    ...step,
    state: done ? 'done' : index === current ? 'current' : 'later',
  }));
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

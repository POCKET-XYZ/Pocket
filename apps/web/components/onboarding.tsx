'use client';

import type { SpecialistProfile, StartupProfile, User } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, ClockIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type StepState = 'done' | 'current' | 'waiting' | 'later';

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
 * Every account is reviewed by hand, so between submitting the verification and
 * being approved there is a wait that is nobody's fault: the wait itself is one
 * of the steps, and it says who has to act.
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
          Getting started on Pocket
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
  const status = user.verificationStatus;
  const approved = status === 'approved';
  const isStartup = user.role === 'startup';

  const verification: Step = {
    title: 'Get your account verified',
    text: {
      not_submitted: 'Send your details. It is a short form: links, no documents.',
      pending: 'Sent. A Pocket manager reviews it by hand, oldest requests first.',
      rejected: 'The manager asked for changes. Fix them and send it again.',
      approved: 'A manager approved your account.',
    }[status],
    state: approved ? 'done' : status === 'pending' ? 'waiting' : 'current',
    action: approved
      ? undefined
      : {
          label: status === 'pending' ? 'See status' : 'Go to verification',
          href: '/verification',
        },
  };

  const profile: Step = {
    title: isStartup ? 'Fill in your startup profile' : 'Fill in your specialist profile',
    text: isStartup
      ? 'What your company does, its stage and what you need help with. Specialists see it on your jobs.'
      : 'Your headline, what you are good at, your categories and your rate. Startups choose by looking at this.',
    state: !approved ? 'later' : hasProfile ? 'done' : 'current',
    action: { label: hasProfile ? 'Edit profile' : 'Create profile', href: '/profile' },
  };

  const first: Step = {
    title: isStartup ? 'Post your first job' : 'Apply to a job',
    text: isStartup
      ? 'Describe the work and the budget. Verified specialists will apply and you pick one.'
      : 'Open jobs are on the board. Apply with your proposal, your price and how long it takes.',
    state: approved && hasProfile ? 'current' : 'later',
    action: isStartup
      ? { label: 'Post a job', href: '/jobs/new' }
      : { label: 'Browse jobs', href: '/jobs' },
  };

  return [verification, profile, first];
}

function StepMark({ state, number }: { state: StepState; number: number }) {
  const base = 'flex size-7 shrink-0 items-center justify-center rounded-full text-sm';
  if (state === 'done') {
    return (
      <span className={cn(base, 'bg-navy text-off-white')} aria-label="Done">
        <CheckIcon className="size-4" />
      </span>
    );
  }
  if (state === 'waiting') {
    return (
      <span className={cn(base, 'bg-yellow text-navy')} aria-label="Waiting for Pocket">
        <ClockIcon className="size-4" />
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

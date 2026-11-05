'use client';

import {
  MetricsPeriod,
  type ContractSummary,
  type DisputeListItem,
  type JobBoard,
  type JobListing,
  type ManagerMetrics,
  type MyApplication,
  type SpecialistProfile,
  type StartupProfile,
  type User,
} from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { JobCard } from '@/components/job-card';
import { Onboarding } from '@/components/onboarding';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { UsdcStatus } from '@/components/usdc-status';
import { api } from '@/lib/api';
import { nextStep } from '@/lib/contract-next-step';
import { usdc } from '@/lib/format';
import { SIGNED_OUT_HOME } from '@/lib/home';
import { specialistFigures, startupFigures } from '@/lib/home-figures';
import { useMyProfile } from '@/lib/use-my-profile';

/**
 * The app's root answers "what do I have to do today?", by role. What Pocket is
 * lives on the public site. The session is in the browser, so the redirect
 * happens here: until the session is known this renders only a spinner, and
 * nobody sees a page they are about to leave.
 */
export function HomePanel() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'signed-out') return;
    if (SIGNED_OUT_HOME.startsWith('http')) window.location.replace(SIGNED_OUT_HOME);
    else router.replace(SIGNED_OUT_HOME);
  }, [status, router]);

  if (status === 'signed-out') return <Loading />;
  return (
    <RequireAuth>
      {(user) =>
        user.role === 'startup' ? (
          <StartupHome user={user} />
        ) : user.role === 'specialist' ? (
          <SpecialistHome user={user} />
        ) : (
          <ManagerHome />
        )
      }
    </RequireAuth>
  );
}

function useMyContracts() {
  return useQuery({
    queryKey: ['contracts', 'mine'],
    queryFn: () => api<ContractSummary[]>('/contracts/mine'),
  });
}

function StartupHome({ user }: { user: User }) {
  const profile = useMyProfile();
  const contracts = useMyContracts();
  const jobs = useQuery({
    queryKey: ['jobs', 'mine'],
    queryFn: () => api<JobListing[]>('/jobs/mine'),
  });
  const error = contracts.error ?? jobs.error;
  const ready = contracts.data && jobs.data;
  const nothingYet = ready && jobs.data.length === 0 && contracts.data.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={greeting((profile.data as StartupProfile | null)?.companyName)}
        description="Lo que tienes pendiente hoy en Pocket."
        actions={
          ready && !nothingYet ? (
            <Button asChild>
              <Link href="/jobs/new">Publicar trabajo</Link>
            </Button>
          ) : null
        }
      />
      <UsdcStatus user={user} />
      {error ? <ErrorAlert error={error} /> : null}
      {!ready && !error ? <Loading /> : null}
      {ready && !nothingYet ? (
        <StartupFigures user={user} contracts={contracts.data} jobs={jobs.data} />
      ) : null}
      <Onboarding full />
      {nothingYet && canStart(user, profile.data) ? (
        <EmptyState title="Todavía no tienes trabajos">
          <p>Publica el primero y elige entre los expertos que se postulen.</p>
          <Button asChild className="mt-4">
            <Link href="/jobs/new">Publicar trabajo</Link>
          </Button>
        </EmptyState>
      ) : null}
    </div>
  );
}

function StartupFigures({
  user,
  contracts,
  jobs,
}: {
  user: User;
  contracts: ContractSummary[];
  jobs: JobListing[];
}) {
  const figures = startupFigures(contracts, jobs);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatTile
          label="Hitos por confirmar"
          value={figures.toConfirm.count}
          attention={figures.toConfirm.count > 0}
          href={figures.toConfirm.href}
        />
        <StatTile
          label="Postulaciones por revisar"
          value={figures.applications.count}
          href={figures.applications.href}
        />
        <StatTile
          label="Contratos en curso"
          value={figures.openContracts}
          href="/contracts"
        />
        <StatTile
          label="Guardado en contratos"
          value={usdc(figures.held)}
          hint={`${usdc(figures.released)} liberados`}
          href="/contracts"
        />
      </div>
      <TodoList
        items={[
          ...contractTodos(contracts, user),
          ...figures.reviewable.map((job) => ({
            href: `/jobs/${job.id}/applicants`,
            title: job.title,
            step:
              job.submittedApplications === 1
                ? 'Revisa 1 postulación'
                : `Revisa ${job.submittedApplications} postulaciones`,
          })),
        ]}
      />
    </>
  );
}

function SpecialistHome({ user }: { user: User }) {
  const profile = useMyProfile();
  const contracts = useMyContracts();
  const applications = useQuery({
    queryKey: ['applications', 'mine'],
    queryFn: () => api<MyApplication[]>('/applications/mine'),
  });
  const board = useQuery({
    queryKey: ['jobs', 'board', null, ''],
    queryFn: () => api<JobBoard>('/jobs?limit=50&offset=0'),
    select: (page) => page.items,
  });
  const error = contracts.error ?? applications.error ?? board.error;
  const ready = contracts.data && applications.data && board.data;
  const nothingYet =
    ready && applications.data.length === 0 && contracts.data.length === 0;
  const figures = ready
    ? specialistFigures(
        contracts.data,
        applications.data,
        board.data,
        (profile.data as SpecialistProfile | null)?.categories ?? [],
      )
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={greeting((profile.data as SpecialistProfile | null)?.displayName)}
        description="Lo que tienes pendiente hoy en Pocket."
        actions={
          ready && !nothingYet ? (
            <Button asChild>
              <Link href="/jobs">Ver trabajos</Link>
            </Button>
          ) : null
        }
      />
      <UsdcStatus user={user} />
      {error ? <ErrorAlert error={error} /> : null}
      {!ready && !error ? <Loading /> : null}
      {ready && figures && !nothingYet ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <StatTile
              label="Hitos por entregar"
              value={figures.toDeliver.count}
              attention={figures.toDeliver.count > 0}
              href={figures.toDeliver.href}
            />
            <StatTile
              label="Postulaciones en espera"
              value={figures.waiting}
              href="/applications"
            />
            <StatTile
              label="Trabajos para ti"
              value={figures.forYou.length}
              href="/jobs"
            />
            <StatTile
              label="Total cobrado"
              value={usdc(figures.collected)}
              hint="Después de comisiones"
              href="/contracts"
            />
          </div>
          <TodoList items={contractTodos(contracts.data, user)} />
        </>
      ) : null}
      <Onboarding full />
      {nothingYet && canStart(user, profile.data) ? (
        <EmptyState title="Todavía no te has postulado a ningún trabajo">
          <p>Elige uno que te interese y envía tu propuesta.</p>
          <Button asChild className="mt-4">
            <Link href="/jobs">Ver trabajos</Link>
          </Button>
        </EmptyState>
      ) : null}
      {figures && figures.forYou.length > 0 ? (
        <section>
          <SectionTitle>Trabajos para ti</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {figures.forYou.slice(0, 3).map((job) => (
              <JobCard key={job.id} job={job} href={`/jobs/${job.id}`} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ManagerHome() {
  const disputes = useQuery({
    queryKey: ['disputes', 'list', 'open'],
    queryFn: () => api<DisputeListItem[]>('/manager/disputes?status=open'),
  });
  const metrics = useQuery({
    queryKey: ['manager', 'metrics', MetricsPeriod.Month],
    queryFn: () => api<ManagerMetrics>(`/manager/metrics?period=${MetricsPeriod.Month}`),
  });
  const error = disputes.error ?? metrics.error;
  const open = disputes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Hola" description="Lo que tienes pendiente hoy en Pocket." />
      {error ? <ErrorAlert error={error} /> : null}
      {!disputes.data || !metrics.data ? (
        error ? null : (
          <Loading />
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
            <StatTile
              label="Disputas abiertas"
              value={open.length}
              attention={open.length > 0}
              href="/manager/disputes"
            />
            <StatTile
              label="Trabajos abiertos"
              value={metrics.data.marketplace.openJobs}
              href="/manager/metrics"
            />
            <StatTile
              label="Cuentas nuevas"
              value={
                metrics.data.users.startups.newInPeriod +
                metrics.data.users.specialists.newInPeriod
              }
              hint="Últimos 30 días"
              href="/manager/metrics"
            />
          </div>
          <TodoList
            items={open.map((dispute) => ({
              href: `/disputes/${dispute.id}`,
              title: dispute.milestone.contract.job.title,
              step: `Resuelve la disputa de ${usdc(dispute.milestone.amount)}`,
            }))}
          />
        </>
      )}
    </div>
  );
}

const greeting = (name?: string | null) => (name ? `Hola, ${name}` : 'Hola');

/**
 * Publishing or applying takes an active account with a profile. Until then the
 * first steps say what is missing, and a button here would lead to a dead end.
 */
const canStart = (user: User, profile: unknown) =>
  user.verificationStatus === 'approved' && Boolean(profile);

function contractTodos(contracts: ContractSummary[], user: User): TodoItem[] {
  return contracts.flatMap((contract) => {
    const step = nextStep(contract, user);
    return step
      ? [{ href: `/contracts/${contract.id}`, title: contract.job.title, step }]
      : [];
  });
}

interface TodoItem {
  href: string;
  title: string;
  step: string;
}

/** Everything waiting on this person, each line going straight to where it is done. */
function TodoList({ items }: { items: TodoItem[] }) {
  return (
    <section>
      <SectionTitle>Para hoy</SectionTitle>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada pendiente por ahora.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={`${item.href}-${item.step}`}
              href={item.href}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition hover:border-celeste sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0 font-medium break-words text-navy">
                {item.title}
              </span>
              <span className="w-fit shrink-0 rounded-full bg-yellow px-3 py-1 text-xs font-semibold text-navy">
                {item.step}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xl font-bold text-navy">{children}</h2>;
}

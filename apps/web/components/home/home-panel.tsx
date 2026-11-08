'use client';

import {
  MetricsPeriod,
  isAccountActive,
  type ContractSummary,
  type DashboardContract,
  type DashboardUpcoming,
  type DisputeListItem,
  type JobBoard,
  type JobListing,
  type ManagerMetrics,
  type MyApplication,
  type SpecialistDashboard,
  type SpecialistProfile,
  type StartupDashboard,
  type StartupProfile,
  type User,
} from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClockIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  FlagIcon,
  SearchIcon,
  ScaleIcon,
  TargetIcon,
  TimerIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  UsersIcon,
  BriefcaseBusinessIcon,
  UploadIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { WeeklyBars, weekLabel } from '@/components/charts/weekly-bars';
import { JobCard } from '@/components/job-card';
import { Onboarding } from '@/components/onboarding';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatTile } from '@/components/stat-tile';
import { statusLabel } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { UsdcStatus } from '@/components/usdc-status';
import { api } from '@/lib/api';
import { nextStep } from '@/lib/contract-next-step';
import { CATEGORY_LABELS, usdc } from '@/lib/format';
import { SIGNED_OUT_HOME } from '@/lib/home';
import {
  deliveryWords,
  percent,
  share,
  specialistFigures,
  startupFigures,
} from '@/lib/home-figures';
import { useMyProfile } from '@/lib/use-my-profile';
import { cn } from '@/lib/utils';

/**
 * The app's root answers "what do I have to do today, and how is it going?", by
 * role. What Pocket is lives on the public site. The session is in the browser,
 * so the redirect happens here: until the session is known this renders only a
 * spinner, and nobody sees a page they are about to leave.
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

const greeting = (name?: string | null) => (name ? `Hola, ${name}` : 'Hola');

/**
 * Publishing or applying takes an active account with a profile. Until then the
 * first steps say what is missing, and a button here would lead to a dead end.
 */
const canStart = (user: User, profile: unknown) =>
  isAccountActive(user) && Boolean(profile);

function StartupHome({ user }: { user: User }) {
  const profile = useMyProfile();
  const contracts = useMyContracts();
  const jobs = useQuery({
    queryKey: ['jobs', 'mine'],
    queryFn: () => api<JobListing[]>('/jobs/mine'),
  });
  const dashboard = useQuery({
    queryKey: ['dashboard', 'startup'],
    queryFn: () => api<StartupDashboard>('/dashboard/startup'),
  });
  const error = contracts.error ?? jobs.error ?? dashboard.error;
  const ready = contracts.data && jobs.data && dashboard.data;
  const nothingYet = ready && jobs.data.length === 0 && contracts.data.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={greeting((profile.data as StartupProfile | null)?.companyName)}
        description="Lo que tienes pendiente hoy y cómo van tus contrataciones."
        actions={
          ready && !nothingYet ? (
            <>
              <Button asChild variant="outline">
                <Link href="/reports">Reporte del periodo</Link>
              </Button>
              <Button asChild>
                <Link href="/jobs/new">Publicar trabajo</Link>
              </Button>
            </>
          ) : null
        }
      />
      <UsdcStatus user={user} />
      {error ? <ErrorAlert error={error} /> : null}
      {!ready && !error ? <Loading /> : null}
      {ready && !nothingYet ? (
        <StartupFigures
          user={user}
          contracts={contracts.data}
          jobs={jobs.data}
          dashboard={dashboard.data}
        />
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
  dashboard,
}: {
  user: User;
  contracts: ContractSummary[];
  jobs: JobListing[];
  dashboard: StartupDashboard;
}) {
  const figures = startupFigures(contracts, jobs);
  const met = share(dashboard.kpis.met, dashboard.kpis.withTarget);
  const judged = dashboard.milestones.onTime + dashboard.milestones.late;
  const onTime = share(dashboard.milestones.onTime, judged);
  const todos = [
    ...contractTodos(contracts, user),
    ...figures.reviewable.map((job) => ({
      href: `/jobs/${job.id}/applicants`,
      title: job.title,
      step:
        job.submittedApplications === 1
          ? 'Revisa 1 postulación'
          : `Revisa ${job.submittedApplications} postulaciones`,
    })),
  ];

  return (
    <>
      <TodoList items={todos} />
      <div className="grid gap-4 lg:grid-cols-5">
        <MoneyCard
          className="lg:col-span-2"
          label="Pagado a expertos"
          amount={dashboard.spent}
          otherLabel="guardado en contratos"
          other={dashboard.held}
          share={shareOfMoney(dashboard.spent, dashboard.held)}
          footer={contractsLine(dashboard.contracts)}
          href="/contracts"
        />
        <WeeklyBars
          className="lg:col-span-3"
          title="Pagado por semana"
          weeks={dashboard.weeks}
          pick={(week) => week.amount}
          format={(value) => usdc(value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatTile
          label="Hitos por confirmar"
          value={figures.toConfirm.count}
          attention={figures.toConfirm.count > 0}
          href={figures.toConfirm.href}
          icon={ClipboardCheckIcon}
        />
        <StatTile
          label="Postulaciones por revisar"
          value={figures.applications.count}
          href={figures.applications.href}
          icon={UsersIcon}
        />
        <StatTile
          label="Metas cumplidas"
          value={percent(met)}
          hint={kpiHint(dashboard.kpis)}
          meter={met}
          icon={TargetIcon}
        />
        <StatTile
          label="Hitos a tiempo"
          value={percent(onTime)}
          hint={timingHint(dashboard.milestones.onTime, judged, dashboard.delivery)}
          meter={onTime}
          icon={TimerIcon}
        />
      </div>
      <ContractResults contracts={dashboard.byContract} />
      <div className="grid gap-4 lg:grid-cols-2">
        <UpcomingCard upcoming={dashboard.upcoming} />
        {dashboard.specialists.length > 0 ? (
          <Panel title="Tus expertos" icon={UsersIcon}>
            <ul className="divide-y divide-border">
              {dashboard.specialists.slice(0, 5).map((specialist) => (
                <li key={specialist.id}>
                  <Link
                    href={`/specialists/${specialist.id}`}
                    className="flex items-center gap-3 py-2.5 hover:text-navy"
                  >
                    <Avatar name={specialist.displayName} url={specialist.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-navy">
                        {specialist.displayName ?? 'Experto'}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {specialist.contracts === 1
                          ? '1 contrato'
                          : `${specialist.contracts} contratos`}
                        {specialist.kpis.withTarget > 0
                          ? ` · ${specialist.kpis.met} de ${specialist.kpis.withTarget} ${
                              specialist.kpis.withTarget === 1 ? 'meta' : 'metas'
                            }`
                          : ''}
                      </span>
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
      {dashboard.byCategory.length > 1 ? (
        <Panel title="En qué has invertido" icon={BriefcaseBusinessIcon}>
          <RankedBars
            rows={dashboard.byCategory.map((row) => ({
              label: CATEGORY_LABELS[row.category],
              value: Number(row.spent),
              text: usdc(row.spent),
            }))}
          />
        </Panel>
      ) : null}
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
  // Its own key: the job board caches pages of an infinite query under
  // ['jobs', 'board', ...], and a plain page under that key breaks it.
  const board = useQuery({
    queryKey: ['jobs', 'first-page'],
    queryFn: () => api<JobBoard>('/jobs?limit=50&offset=0'),
    select: (page) => page.items,
  });
  const dashboard = useQuery({
    queryKey: ['dashboard', 'specialist'],
    queryFn: () => api<SpecialistDashboard>('/dashboard/specialist'),
  });
  const error = contracts.error ?? applications.error ?? board.error ?? dashboard.error;
  const ready = contracts.data && applications.data && board.data && dashboard.data;
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
  const stats = dashboard.data;
  const met = stats ? share(stats.kpis.met, stats.kpis.withTarget) : null;
  const judged = stats ? stats.milestones.onTime + stats.milestones.late : 0;
  const onTime = stats ? share(stats.milestones.onTime, judged) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={greeting((profile.data as SpecialistProfile | null)?.displayName)}
        description="Lo que tienes pendiente hoy y cómo va tu trabajo."
        actions={
          ready && !nothingYet ? (
            <>
              <Button asChild variant="outline">
                <Link href="/reports">Reporte del periodo</Link>
              </Button>
              <Button asChild>
                <Link href="/jobs">Ver trabajos</Link>
              </Button>
            </>
          ) : null
        }
      />
      <UsdcStatus user={user} />
      {error ? <ErrorAlert error={error} /> : null}
      {!ready && !error ? <Loading /> : null}
      {ready && stats && figures && !nothingYet ? (
        <>
          <TodoList items={contractTodos(contracts.data, user)} />
          <div className="grid gap-4 lg:grid-cols-5">
            <MoneyCard
              className="lg:col-span-2"
              label="Total cobrado"
              amount={stats.collected}
              otherLabel="por cobrar en contratos"
              other={stats.toCollect}
              share={shareOfMoney(stats.collected, stats.toCollect)}
              footer={contractsLine(stats.contracts)}
              note="Ya con las comisiones descontadas"
              href="/contracts"
            />
            <WeeklyBars
              className="lg:col-span-3"
              title="Cobrado por semana"
              weeks={stats.weeks}
              pick={(week) => week.amount}
              format={(value) => usdc(value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <StatTile
              label="Hitos por entregar"
              value={figures.toDeliver.count}
              attention={figures.toDeliver.count > 0}
              href={figures.toDeliver.href}
              icon={UploadIcon}
            />
            <StatTile
              label="Postulaciones en espera"
              value={figures.waiting}
              href="/applications"
              icon={SearchIcon}
            />
            <StatTile
              label="Metas cumplidas"
              value={percent(met)}
              hint={kpiHint(stats.kpis)}
              meter={met}
              icon={TargetIcon}
            />
            <StatTile
              label="Entregas a tiempo"
              value={percent(onTime)}
              hint={timingHint(stats.milestones.onTime, judged, stats.delivery)}
              meter={onTime}
              icon={TimerIcon}
            />
          </div>
          <UpcomingCard upcoming={stats.upcoming} />
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
  const data = metrics.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hola"
        description="Lo que tienes pendiente hoy y cómo va Pocket."
      />
      {error ? <ErrorAlert error={error} /> : null}
      {!disputes.data || !data ? (
        error ? null : (
          <Loading />
        )
      ) : (
        <>
          <TodoList
            items={open.map((dispute) => ({
              href: `/disputes/${dispute.id}`,
              title: dispute.milestone.contract.job.title,
              step: `Resuelve la disputa de ${usdc(dispute.milestone.amount)}`,
            }))}
          />
          <div className="grid gap-4 lg:grid-cols-5">
            <MoneyCard
              className="lg:col-span-2"
              label="Guardado en contratos ahora"
              amount={data.money.inEscrow}
              otherLabel="pagados a expertos en 30 días"
              other={data.money.released}
              footer={`Comisión de Pocket en 30 días: ${usdc(data.money.pocketFee)}`}
              href="/manager/metrics"
            />
            <WeeklyBars
              className="lg:col-span-3"
              title="Pagado a expertos por semana"
              weeks={data.weekly}
              pick={(week) => week.released}
              format={(value) => usdc(value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <StatTile
              label="Disputas abiertas"
              value={open.length}
              attention={open.length > 0}
              href="/manager/disputes"
              icon={ScaleIcon}
            />
            <StatTile
              label="Hitos atrasados"
              value={data.health.overdueMilestones}
              attention={data.health.overdueMilestones > 0}
              href="/manager/metrics"
              icon={TriangleAlertIcon}
            />
            <StatTile
              label="Trabajos abiertos"
              value={data.marketplace.openJobs}
              href="/manager/metrics"
              icon={BriefcaseBusinessIcon}
            />
            <StatTile
              label="Cuentas nuevas"
              value={data.users.startups.newInPeriod + data.users.specialists.newInPeriod}
              hint="Últimos 30 días"
              href="/manager/metrics"
              icon={UserPlusIcon}
            />
          </div>
          <WeeklyBars
            title="Cuentas nuevas por semana"
            weeks={data.weekly}
            pick={(week) => week.newUsers}
            format={(value) => String(value)}
          />
        </>
      )}
    </div>
  );
}

function shareOfMoney(part: string, other: string): number | null {
  return share(Number(part), Number(part) + Number(other));
}

function contractsLine(contracts: { active: number; completed: number }): string {
  const inProgress =
    contracts.active === 1
      ? '1 contrato en curso'
      : `${contracts.active} contratos en curso`;
  return `${inProgress} · ${contracts.completed} ${
    contracts.completed === 1 ? 'completado' : 'completados'
  }`;
}

function kpiHint(kpis: { withTarget: number; met: number }): string {
  return kpis.withTarget > 0 ? `${kpis.met} de ${kpis.withTarget}` : 'Sin resultados aún';
}

/** "4 de 5 · 1 día antes en promedio": how many came in on time, and by how much. */
function timingHint(
  onTime: number,
  judged: number,
  delivery: StartupDashboard['delivery'],
): string {
  if (judged === 0) return 'Sin entregas aún';
  const words = deliveryWords(delivery);
  return words
    ? `${onTime} de ${judged} · ${words} en promedio`
    : `${onTime} de ${judged}`;
}

/**
 * Each contract against what it set out to do: targets met, milestones on
 * time, how early it delivers and what it cost, each row opening its report.
 */
function ContractResults({ contracts }: { contracts: DashboardContract[] }) {
  if (contracts.length === 0) return null;
  const shown = contracts.slice(0, 6);
  const columns = 'md:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem_7rem]';
  return (
    <Panel title="Resultados por contrato" icon={FileTextIcon}>
      <div
        className={cn(
          'hidden gap-3 border-b border-border pb-2 text-xs text-muted-foreground md:grid',
          columns,
        )}
      >
        <span>Contrato</span>
        <span>Metas cumplidas</span>
        <span>Hitos a tiempo</span>
        <span>Entrega promedio</span>
        <span className="text-right">Pagado</span>
      </div>
      <ul className="divide-y divide-border">
        {shown.map((row) => {
          const judged = row.milestones.onTime + row.milestones.late;
          return (
            <li key={row.contractId}>
              <Link
                href={`/contracts/${row.contractId}/report`}
                className={cn('grid gap-x-3 gap-y-2 py-3 md:items-center', columns)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-navy">
                    {row.jobTitle}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.specialist.displayName ?? 'Experto'} · {statusLabel(row.status)}
                  </span>
                </span>
                <span className="grid grid-cols-4 gap-2 text-xs md:contents md:text-sm">
                  <Figure
                    label="Metas"
                    value={
                      row.kpis.withTarget > 0
                        ? `${row.kpis.met} de ${row.kpis.withTarget}`
                        : '-'
                    }
                    meter={share(row.kpis.met, row.kpis.withTarget)}
                  />
                  <Figure
                    label="A tiempo"
                    value={judged > 0 ? `${row.milestones.onTime} de ${judged}` : '-'}
                    meter={share(row.milestones.onTime, judged)}
                  />
                  <Figure
                    label="Entrega"
                    value={capitalize(deliveryWords(row.delivery) ?? '-')}
                  />
                  <Figure label="Pagado" value={usdc(row.spent)} alignEnd />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {contracts.length > shown.length ? (
        <Link
          href="/contracts"
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-navy hover:underline"
        >
          Ver los {contracts.length} contratos
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      ) : null}
    </Panel>
  );
}

/** One figure of a contract's row: labeled on a phone, under its column on a screen. */
function Figure({
  label,
  value,
  meter,
  alignEnd = false,
}: {
  label: string;
  value: string;
  meter?: number | null;
  alignEnd?: boolean;
}) {
  return (
    <span className={cn('min-w-0', alignEnd && 'md:text-right')}>
      <span className="block text-muted-foreground md:hidden">{label}</span>
      <span className="block font-medium text-navy tabular-nums">{value}</span>
      {meter !== undefined && meter !== null ? (
        <span
          className="mt-1 block h-1 overflow-hidden rounded-full bg-celeste-light/60"
          aria-hidden
        >
          <span
            className="block h-full rounded-full bg-navy"
            style={{ width: `${Math.round(meter * 100)}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The figure a panel leads with, and how much of the money has already moved. */
function MoneyCard({
  label,
  amount,
  otherLabel,
  other,
  share: moved,
  footer,
  note,
  href,
  className,
}: {
  label: string;
  amount: string;
  otherLabel: string;
  other: string;
  share?: number | null;
  footer?: string;
  note?: string;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex min-w-0 flex-col rounded-2xl bg-navy p-5 text-off-white transition hover:bg-navy/95',
        className,
      )}
    >
      <p className="text-sm text-off-white/75">{label}</p>
      <p
        title={usdc(amount)}
        className="mt-1 text-5xl font-bold tracking-tight wrap-anywhere tabular-nums"
      >
        {Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}
        <span className="ml-2 text-lg font-medium text-off-white/75">USDC</span>
      </p>
      {note ? <p className="mt-1 text-xs text-off-white/60">{note}</p> : null}
      {moved !== undefined && moved !== null ? (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <div
            className="h-full rounded-full bg-mandarina"
            style={{ width: `${Math.round(moved * 100)}%` }}
          />
        </div>
      ) : null}
      <p className="mt-3 text-sm">
        <span className="font-semibold">{usdc(other)}</span>{' '}
        <span className="text-off-white/75">{otherLabel}</span>
      </p>
      {footer ? <p className="mt-auto pt-3 text-xs text-off-white/60">{footer}</p> : null}
    </Link>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 font-sans text-sm font-medium text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function UpcomingCard({ upcoming }: { upcoming: DashboardUpcoming[] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Panel title="Próximas entregas" icon={CalendarClockIcon}>
      {upcoming.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No hay entregas pendientes.</p>
      ) : (
        <ul className="divide-y divide-border">
          {upcoming.map((item) => {
            const late = item.dueDate.slice(0, 10) < today;
            return (
              <li key={`${item.contractId}-${item.milestoneTitle}`}>
                <Link
                  href={`/contracts/${item.contractId}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span
                    className={cn(
                      'w-16 shrink-0 rounded-lg px-1 py-1.5 text-center text-xs font-medium',
                      late ? 'bg-warning text-navy' : 'bg-celeste-light/60 text-navy',
                    )}
                  >
                    {late ? 'Atrasado' : weekLabel(item.dueDate)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-navy">
                      {item.milestoneTitle}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.jobTitle}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-navy tabular-nums">
                    {usdc(item.amount)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** Where the money went, largest first, each amount written beside its bar. */
function RankedBars({
  rows,
}: {
  rows: { label: string; value: number; text: string }[];
}) {
  const max = Math.max(...rows.map((row) => row.value), 0);
  return (
    <ul className="space-y-2 py-1">
      {rows.map((row) => (
        <li
          key={row.label}
          className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate text-navy">{row.label}</span>
          <span className="h-3 overflow-hidden rounded-r bg-transparent">
            <span
              className="block h-full rounded-r bg-navy"
              style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }}
            />
          </span>
          <span className="text-muted-foreground tabular-nums">{row.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="size-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-celeste-light text-sm font-semibold text-navy">
      {(name ?? 'E').slice(0, 1).toUpperCase()}
    </span>
  );
}

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
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <FlagIcon className="size-4 shrink-0" aria-hidden />
        Nada pendiente por ahora.
      </p>
    );
  }
  return (
    <section>
      <SectionTitle>Para hoy</SectionTitle>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={`${item.href}-${item.step}`}
            href={item.href}
            className="flex flex-col gap-2 rounded-2xl border border-warning bg-warning/10 p-4 transition hover:bg-warning/20 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0 font-medium break-words text-navy">
              {item.title}
            </span>
            <span className="flex w-fit shrink-0 items-center gap-1 rounded-full bg-warning px-3 py-1 text-xs font-semibold text-navy">
              {item.step}
              <ChevronRightIcon className="size-3.5" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xl font-bold text-navy">{children}</h2>;
}

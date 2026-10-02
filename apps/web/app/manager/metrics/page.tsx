'use client';

import {
  MetricsPeriod,
  POCKET_FEE_PERCENT,
  TRUSTLESS_WORK_FEE_PERCENT,
  type ManagerMetrics,
  type MetricsWeek,
} from '@pocket/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const PERIODS: { value: MetricsPeriod; tab: string; hint: string }[] = [
  { value: MetricsPeriod.Week, tab: '7 days', hint: 'in the last 7 days' },
  { value: MetricsPeriod.Month, tab: '30 days', hint: 'in the last 30 days' },
  { value: MetricsPeriod.Quarter, tab: '90 days', hint: 'in the last 90 days' },
  { value: MetricsPeriod.All, tab: 'All time', hint: 'since launch' },
];

export default function ManagerMetricsPage() {
  return <RequireAuth roles={['manager']}>{() => <Metrics />}</RequireAuth>;
}

function Metrics() {
  const [period, setPeriod] = useState<MetricsPeriod>(MetricsPeriod.Month);
  const metrics = useQuery({
    queryKey: ['manager', 'metrics', period],
    queryFn: () => api<ManagerMetrics>(`/manager/metrics?period=${period}`),
    // Switching periods keeps the numbers on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
  const inPeriod = PERIODS.find((option) => option.value === period)?.hint ?? '';

  return (
    <div>
      <PageHeader
        title="Metrics"
        description="How Pocket is doing. Numbers marked with the period happened inside it; the rest are the state right now."
      />
      <Tabs
        value={period}
        onValueChange={(value) => setPeriod(value as MetricsPeriod)}
        className="mb-6"
      >
        <TabsList>
          {PERIODS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {metrics.isLoading ? (
        <Loading label="Loading metrics" />
      ) : metrics.error && !metrics.data ? (
        <ErrorAlert error={metrics.error} title="The metrics could not be loaded" />
      ) : metrics.data ? (
        <div
          className={cn(
            'space-y-10 transition-opacity',
            metrics.isPlaceholderData && 'opacity-60',
          )}
          aria-busy={metrics.isFetching}
        >
          <Dashboard data={metrics.data} inPeriod={inPeriod} />
          <p className="text-xs text-muted-foreground">
            Updated {dateTime(metrics.data.generatedAt)}. Weeks start on Monday (UTC).
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Dashboard({ data, inPeriod }: { data: ManagerMetrics; inPeriod: string }) {
  const { users, marketplace, money, health } = data;
  const { verification } = users;
  const { offers } = marketplace;

  return (
    <>
      <Section title="Users">
        <StatTile
          label="Startups"
          value={count(users.startups.total)}
          hint={`${count(users.startups.newInPeriod)} new ${inPeriod}`}
        />
        <StatTile
          label="Specialists"
          value={count(users.specialists.total)}
          hint={`${count(users.specialists.newInPeriod)} new ${inPeriod}`}
        />
        <StatTile
          label="Verifications waiting"
          value={count(verification.pending)}
          hint="In the queue right now"
          href="/manager/verifications"
        />
        <StatTile label="Approved" value={count(verification.approved)} hint={inPeriod} />
        <StatTile label="Rejected" value={count(verification.rejected)} hint={inPeriod} />
        <StatTile
          label="Median time to approve"
          value={verification.medianHoursToApprove ?? '-'}
          unit={verification.medianHoursToApprove === null ? undefined : 'hours'}
          hint={`From submission to approval, ${inPeriod}`}
        />
      </Section>

      <Section title="Marketplace">
        <StatTile
          label="Jobs posted"
          value={count(marketplace.jobsPosted)}
          hint={inPeriod}
        />
        <StatTile
          label="Open jobs"
          value={count(marketplace.openJobs)}
          hint="Right now"
        />
        <StatTile
          label="Applications"
          value={count(marketplace.applications)}
          hint={inPeriod}
        />
        <StatTile
          label="Applications per job"
          value={marketplace.averageApplicationsPerJob ?? '-'}
          hint={`Average over the jobs posted ${inPeriod}`}
        />
        <StatTile label="Offers sent" value={count(offers.sent)} hint={inPeriod} />
        <StatTile
          label="Offers accepted"
          value={count(offers.accepted)}
          hint={inPeriod}
        />
        <StatTile
          label="Offers declined"
          value={count(offers.declined)}
          hint={inPeriod}
        />
        <StatTile
          label="Offers withdrawn"
          value={offers.withdrawn === null ? 'Not tracked' : count(offers.withdrawn)}
          hint="A withdrawn offer is deleted, so it leaves no record"
        />
        <StatTile
          label="Offers awaiting reply"
          value={count(offers.awaitingReply)}
          hint="Right now"
        />
        <StatTile
          label="Time to first hire"
          value={marketplace.medianDaysToFirstHire ?? '-'}
          unit={marketplace.medianDaysToFirstHire === null ? undefined : 'days'}
          hint={`Median, from posting to the first accepted offer, ${inPeriod}`}
        />
      </Section>

      <Section title="Money">
        <StatTile
          label="Funded into escrow"
          value={exactUsdc(money.funded)}
          unit="USDC"
          hint={`${count(money.contractsFunded)} ${money.contractsFunded === 1 ? 'contract' : 'contracts'} funded ${inPeriod}`}
        />
        <StatTile
          label="Released to specialists"
          value={exactUsdc(money.released)}
          unit="USDC"
          hint={`${inPeriod}, before Trustless Work's ${TRUSTLESS_WORK_FEE_PERCENT}% fee`}
        />
        <StatTile
          label="Pocket fee earned"
          value={exactUsdc(money.pocketFee)}
          unit="USDC"
          hint={`${POCKET_FEE_PERCENT}% of what was released ${inPeriod}`}
        />
        <StatTile
          label="Held in escrow"
          value={exactUsdc(money.inEscrow)}
          unit="USDC"
          hint="Right now, across active contracts"
        />
        <StatTile
          label="Average contract"
          value={money.averageContract === null ? '-' : exactUsdc(money.averageContract)}
          unit={money.averageContract === null ? undefined : 'USDC'}
          hint={`Of the contracts funded ${inPeriod}`}
        />
        <StatTile
          label="Refunded to startups"
          value={exactUsdc(money.refunded)}
          unit="USDC"
          hint={`By resolved disputes, ${inPeriod}`}
        />
      </Section>

      <Section title="Health">
        <StatTile
          label="Open disputes"
          value={count(health.openDisputes)}
          hint="Right now"
          attention={health.openDisputes > 0}
          href="/manager/disputes"
        />
        <StatTile
          label="Disputes resolved"
          value={count(health.disputesResolved)}
          hint={inPeriod}
        />
        <StatTile
          label="Overdue milestones"
          value={count(health.overdueMilestones)}
          hint="Active contracts, past the due date and not approved"
          attention={health.overdueMilestones > 0}
        />
        <StatTile
          label="Waiting for funding"
          value={count(health.staleAwaitingFunding)}
          hint="Accepted over 3 days ago and still not funded"
          attention={health.staleAwaitingFunding > 0}
        />
      </Section>

      <section>
        <h2 className="mb-1 text-xl font-semibold text-navy">Last 12 weeks</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Not affected by the period. Hover or tap a bar to read its week.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <WeeklyBars
            title="New users"
            weeks={data.weekly}
            pick={(week) => week.newUsers}
            format={(value) => count(value as number)}
          />
          <WeeklyBars
            title="Jobs posted"
            weeks={data.weekly}
            pick={(week) => week.jobsPosted}
            format={(value) => count(value as number)}
          />
          <WeeklyBars
            title="USDC funded into escrow"
            weeks={data.weekly}
            pick={(week) => week.funded}
            format={(value) => `${exactUsdc(value as string)} USDC`}
          />
          <WeeklyBars
            title="USDC released to specialists"
            weeks={data.weekly}
            pick={(week) => week.released}
            format={(value) => `${exactUsdc(value as string)} USDC`}
          />
        </div>
      </section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-navy">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

/** One headline number: label, value, and what it counts. */
function StatTile({
  label,
  value,
  unit,
  hint,
  attention = false,
  href,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  /** Something a manager should look at: shown with an icon and words, not color alone. */
  attention?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl leading-tight font-semibold text-navy wrap-anywhere">
        {value}
        {unit ? (
          <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </p>
      {attention ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-navy">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-destructive" aria-hidden />
          Needs attention
        </p>
      ) : null}
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{capitalize(hint)}</p>
      ) : null}
    </>
  );
  const className = 'min-w-0 rounded-2xl border border-border bg-card p-4';
  return href ? (
    <Link href={href} className={cn(className, 'transition hover:border-celeste')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Twelve weekly columns of one series, with the hovered (or latest) week read
 * out above them and the full numbers in a table below.
 */
function WeeklyBars({
  title,
  weeks,
  pick,
  format,
}: {
  title: string;
  weeks: MetricsWeek[];
  pick: (week: MetricsWeek) => number | string;
  format: (value: number | string) => string;
}) {
  const latest = weeks.length - 1;
  const [selected, setSelected] = useState(latest);
  const values = weeks.map(pick);
  // Heights only: the numbers shown always come from the exact values.
  const heights = values.map(Number);
  const max = Math.max(...heights, 0);
  const shown = weeks[selected] ?? weeks[latest];

  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <h3 className="font-sans text-sm font-medium text-muted-foreground">{title}</h3>
      {shown ? (
        <p className="mt-1 text-sm" aria-live="polite">
          <span className="font-heading text-lg font-semibold text-navy">
            {format(values[selected] ?? 0)}
          </span>{' '}
          <span className="text-muted-foreground">
            {selected === latest ? 'this week' : `week of ${weekLabel(shown.weekStart)}`}
          </span>
        </p>
      ) : null}

      {max === 0 ? (
        <p className="flex h-28 items-center justify-center text-sm text-muted-foreground">
          Nothing in the last 12 weeks
        </p>
      ) : (
        <div
          className="mt-3 flex h-28 items-end gap-0.5 border-b border-border"
          onMouseLeave={() => setSelected(latest)}
        >
          {weeks.map((week, index) => (
            <button
              key={week.weekStart}
              type="button"
              aria-label={`Week of ${weekLabel(week.weekStart)}: ${format(values[index])}`}
              aria-pressed={index === selected}
              onMouseEnter={() => setSelected(index)}
              onFocus={() => setSelected(index)}
              onClick={() => setSelected(index)}
              className="flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  'block w-full max-w-6 rounded-t-[4px] transition-colors',
                  index === selected ? 'bg-navy' : 'bg-chart-4/60',
                )}
                style={{
                  // A week with anything at all stays visible next to a big one.
                  height:
                    heights[index] > 0 ? `max(2px, ${(heights[index] / max) * 100}%)` : 0,
                }}
              />
            </button>
          ))}
        </div>
      )}
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{weeks[0] ? weekLabel(weeks[0].weekStart) : ''}</span>
        <span>This week</span>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-navy">
          Show as table
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Week of</th>
              <th className="py-1 text-right font-medium">{title}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {weeks.map((week, index) => (
              <tr key={week.weekStart} className="border-t border-border">
                <td className="py-1">{weekLabel(week.weekStart)}</td>
                <td className="py-1 text-right">{format(values[index])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * A USDC amount exactly as the API sent it, with thousands separators. Never
 * through a float, so no decimal is lost or invented.
 */
function exactUsdc(amount: string): string {
  const [whole, fraction] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function weekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

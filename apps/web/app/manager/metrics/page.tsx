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
      <Overview data={data} inPeriod={inPeriod} />

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
          label="Jobs completed"
          value={count(marketplace.jobsCompleted)}
          hint={`Contracts finished ${inPeriod}, one per job`}
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
          value={<Usdc amount={money.funded} />}
          unit="USDC"
          hint={`${count(money.contractsFunded)} ${money.contractsFunded === 1 ? 'contract' : 'contracts'} funded ${inPeriod}`}
        />
        <StatTile
          label="Released to specialists"
          value={<Usdc amount={money.released} />}
          unit="USDC"
          hint={`${inPeriod}, before Trustless Work's ${TRUSTLESS_WORK_FEE_PERCENT}% fee`}
        />
        <StatTile
          label="Pocket fee earned"
          value={<Usdc amount={money.pocketFee} />}
          unit="USDC"
          hint={`${POCKET_FEE_PERCENT}% of each payout on contracts created with the fee, ${inPeriod}`}
        />
        <StatTile
          label="Sent from Pocket wallets"
          value={<Usdc amount={money.walletPayments} />}
          unit="USDC"
          hint={`${count(money.walletPaymentCount)} ${money.walletPaymentCount === 1 ? 'payment' : 'payments'} users sent from Pocket to other wallets ${inPeriod}. Money arriving from outside is not recorded`}
        />
        <StatTile
          label="Held in escrow"
          value={<Usdc amount={money.inEscrow} />}
          unit="USDC"
          hint="Right now, across active contracts"
        />
        <StatTile
          label="Average contract"
          value={money.averageContract === null ? '-' : <Usdc amount={money.averageContract} />}
          unit={money.averageContract === null ? undefined : 'USDC'}
          hint={`Of the contracts funded ${inPeriod}`}
        />
        <StatTile
          label="Refunded to startups"
          value={<Usdc amount={money.refunded} />}
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
          hint="Past the due date and not delivered yet"
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
            format={(value) => `${shortUsdc(String(value))} USDC`}
          />
          <WeeklyBars
            title="USDC released to specialists"
            weeks={data.weekly}
            pick={(week) => week.released}
            format={(value) => `${shortUsdc(String(value))} USDC`}
          />
        </div>
      </section>
    </>
  );
}

/**
 * Small line charts of the last 12 weeks, one per headline number, so the
 * trend reads at a glance. Each card leads with the number for the period.
 */
function Overview({ data, inPeriod }: { data: ManagerMetrics; inPeriod: string }) {
  const { users, marketplace, money, weekly } = data;
  const usdcValue = (value: number | string) => `${shortUsdc(String(value))} USDC`;
  const countValue = (value: number | string) => count(value as number);

  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold text-navy">Overview</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        The big number is for the period; the line is the last 12 weeks. Hover or tap the
        line to read a week.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <WeeklyLine
          title="New users"
          headline={count(users.startups.newInPeriod + users.specialists.newInPeriod)}
          hint={`Startups and specialists who signed up ${inPeriod}`}
          weeks={weekly}
          pick={(week) => week.newUsers}
          format={countValue}
        />
        <WeeklyLine
          title="Jobs posted"
          headline={count(marketplace.jobsPosted)}
          hint={inPeriod}
          weeks={weekly}
          pick={(week) => week.jobsPosted}
          format={countValue}
        />
        <WeeklyLine
          title="Jobs completed"
          headline={count(marketplace.jobsCompleted)}
          hint={inPeriod}
          weeks={weekly}
          pick={(week) => week.jobsCompleted}
          format={countValue}
        />
        <WeeklyLine
          title="USDC funded into escrow"
          headline={<Usdc amount={money.funded} />}
          unit="USDC"
          hint={inPeriod}
          weeks={weekly}
          pick={(week) => week.funded}
          format={usdcValue}
        />
        <WeeklyLine
          title="USDC released"
          headline={<Usdc amount={money.released} />}
          unit="USDC"
          hint={`To specialists ${inPeriod}`}
          weeks={weekly}
          pick={(week) => week.released}
          format={usdcValue}
        />
        <WeeklyLine
          title="Sent between wallets"
          headline={<Usdc amount={money.walletPayments} />}
          unit="USDC"
          hint={`From Pocket wallets to other addresses ${inPeriod}`}
          weeks={weekly}
          pick={(week) => week.walletPayments}
          format={usdcValue}
        />
        <WeeklyLine
          title="Pocket fee earned"
          headline={<Usdc amount={money.pocketFee} />}
          unit="USDC"
          hint={inPeriod}
          weeks={weekly}
          pick={(week) => week.pocketFee}
          format={usdcValue}
        />
      </div>
    </section>
  );
}

/** Plot size in SVG units. The SVG stretches to the card; lines keep 2px. */
const PLOT_WIDTH = 300;
const PLOT_HEIGHT = 80;

/**
 * One series over the last 12 weeks as a 2px line with a faint wash under it.
 * A column per week takes the pointer, so the reader aims at a week rather
 * than at the line; the hovered week gets a hairline and a dot, and its value
 * shows in a tooltip. The latest week is labeled under the headline, and every
 * week is in the table below.
 */
function WeeklyLine({
  title,
  headline,
  unit,
  hint,
  weeks,
  pick,
  format,
}: {
  title: string;
  headline: React.ReactNode;
  unit?: string;
  hint: string;
  weeks: MetricsWeek[];
  pick: (week: MetricsWeek) => number | string;
  format: (value: number | string) => string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const latest = weeks.length - 1;
  const values = weeks.map(pick);
  // Geometry only: the numbers shown always come from the exact values.
  const heights = values.map(Number);
  const max = Math.max(...heights, 0);
  const peak = heights.indexOf(max);

  const xOf = (index: number) =>
    weeks.length > 1 ? (index / (weeks.length - 1)) * PLOT_WIDTH : PLOT_WIDTH / 2;
  // A flat line of zeros sits on the baseline.
  const yOf = (index: number) =>
    max > 0 ? PLOT_HEIGHT - (heights[index] / max) * PLOT_HEIGHT : PLOT_HEIGHT;
  const line = weeks
    .map((_, index) => `${index === 0 ? 'M' : 'L'}${xOf(index)},${yOf(index)}`)
    .join(' ');
  const area = `${line} L${xOf(latest)},${PLOT_HEIGHT} L${xOf(0)},${PLOT_HEIGHT} Z`;

  const summary =
    weeks.length === 0
      ? `${title}: no data`
      : max === 0
        ? `${title}, last 12 weeks: nothing in any week.`
        : `${title}, last 12 weeks: ${format(values[0])} in the week of ${weekLabel(weeks[0].weekStart)}, ${format(values[latest])} this week, highest ${format(values[peak])} in the week of ${weekLabel(weeks[peak].weekStart)}.`;

  const shown = selected ?? latest;
  const left = `${(xOf(shown) / PLOT_WIDTH) * 100}%`;
  const top = `${(yOf(shown) / PLOT_HEIGHT) * 100}%`;
  // Keep the tooltip inside the card: it hangs right of the points in the
  // first third, left of them in the last, and centered in between.
  const third = weeks.length / 3;
  const shift =
    shown < third
      ? 'translate-x-0'
      : shown >= weeks.length - third
        ? '-translate-x-full'
        : '-translate-x-1/2';

  return (
    <figure className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <figcaption>
        <h3 className="font-sans text-sm font-medium text-muted-foreground">{title}</h3>
        <p className="mt-1 font-heading text-2xl leading-tight font-semibold text-navy wrap-anywhere">
          {headline}
          {unit ? (
            <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{capitalize(hint)}</p>
      </figcaption>

      {weeks.length > 0 ? (
        <>
          <div className="relative mt-4 h-20" onMouseLeave={() => setSelected(null)}>
            <svg
              role="img"
              aria-label={summary}
              viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              <line
                x1={0}
                x2={PLOT_WIDTH}
                y1={PLOT_HEIGHT}
                y2={PLOT_HEIGHT}
                className="stroke-border"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <path d={area} className="fill-chart-1/10" />
              <path
                d={line}
                fill="none"
                className="stroke-chart-1"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {selected !== null ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-muted-foreground/40"
                style={{ left }}
              />
            ) : null}
            {/* The dot is HTML so the stretched SVG cannot squash it into an oval. */}
            <span
              aria-hidden
              className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-chart-1"
              style={{ left, top }}
            />
            {selected !== null ? (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute -top-2 z-10 w-max max-w-40 -translate-y-full rounded-lg border border-border bg-card px-2 py-1 text-xs shadow-sm wrap-anywhere',
                  shift,
                )}
                style={{ left }}
              >
                <span className="block font-semibold text-navy">
                  {format(values[selected])}
                </span>
                <span className="block text-muted-foreground">
                  {selected === latest
                    ? 'This week'
                    : `Week of ${weekLabel(weeks[selected].weekStart)}`}
                </span>
              </span>
            ) : null}

            {/* One hit area per week, centered on its point and as wide as the gap between points. */}
            <div className="absolute inset-0">
              {weeks.map((week, index) => (
                <button
                  key={week.weekStart}
                  type="button"
                  aria-label={`${title}, week of ${weekLabel(week.weekStart)}: ${format(values[index])}`}
                  aria-pressed={index === selected}
                  onMouseEnter={() => setSelected(index)}
                  onFocus={() => setSelected(index)}
                  onBlur={() => setSelected(null)}
                  onClick={() => setSelected(index)}
                  className="absolute inset-y-0 -translate-x-1/2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    left: `${(xOf(index) / PLOT_WIDTH) * 100}%`,
                    width: `${100 / Math.max(weeks.length - 1, 1)}%`,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
            <span>{weekLabel(weeks[0].weekStart)}</span>
            <span>
              This week:{' '}
              <span className="font-medium text-navy">{format(values[latest])}</span>
            </span>
          </div>
        </>
      ) : null}

      <WeeksTable title={title} weeks={weeks} values={values} format={format} />
    </figure>
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
  value: React.ReactNode;
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

      <WeeksTable title={title} weeks={weeks} values={values} format={format} />
    </div>
  );
}

/** Every week of a chart as numbers, folded away until asked for. */
function WeeksTable({
  title,
  weeks,
  values,
  format,
}: {
  title: string;
  weeks: MetricsWeek[];
  values: (number | string)[];
  format: (value: number | string) => string;
}) {
  return (
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
  );
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * A USDC amount exactly as the API sent it, with thousands separators. Never
 * through a float, so no decimal is lost or invented.
 */
/** An amount rounded to cents, to read at a glance. */
function shortUsdc(amount: string): string {
  const value = Number(amount);
  return value > 0 && value < 0.01
    ? '<0.01'
    : value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** An amount rounded to cents; the exact one on hover. */
function Usdc({ amount }: { amount: string }) {
  return <span title={`${exactUsdc(amount)} USDC`}>{shortUsdc(amount)}</span>;
}

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

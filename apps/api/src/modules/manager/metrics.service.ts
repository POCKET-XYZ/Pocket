import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MetricsPeriod,
  POCKET_FEE_PERCENT,
  type ManagerMetrics,
  type MetricsWeek,
} from '@pocket/shared';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Days each period looks back. All time has no start. */
const PERIOD_DAYS: Record<MetricsPeriod, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

/** How many weeks the small charts show, the current one included. */
export const SERIES_WEEKS = 12;

/** A contract accepted this long ago and still not funded needs a nudge. */
export const STALE_FUNDING_DAYS = 3;

/** Contract statuses reached only once the specialist accepted the offer. */
const ACCEPTED_STATUSES = Prisma.sql`('awaiting_funding', 'active', 'completed')`;

/** Count columns come back as int; sums of money as numeric (a Decimal). */
type Count = number | bigint | null;
type Amount = Prisma.Decimal | string | number | null;

interface UserRow {
  startups: Count;
  new_startups: Count;
  specialists: Count;
  new_specialists: Count;
}
interface VerificationRow {
  pending: Count;
  approved: Count;
  rejected: Count;
  median_hours_to_approve: number | null;
}
interface JobRow {
  posted: Count;
  open: Count;
  applications: Count;
  applications_on_posted: Count;
}
interface ContractRow {
  offers_sent: Count;
  offers_accepted: Count;
  offers_declined: Count;
  awaiting_reply: Count;
  funded_count: Count;
  funded: Amount;
  stale_awaiting_funding: Count;
  median_days_to_first_hire: number | null;
}
interface MilestoneRow {
  released: Amount;
  in_escrow: Amount;
  overdue: Count;
}
interface DisputeRow {
  open: Count;
  resolved: Count;
  to_specialists: Amount;
  to_startups: Amount;
}
interface WeekRow {
  series: 'users' | 'jobs' | 'funded' | 'released';
  week: Date;
  count: Count;
  amount: Amount;
}

/**
 * Platform metrics for managers. Each table is read once with every count it
 * feeds computed in the same pass, so the whole dashboard is seven queries.
 * Timestamps are stored in UTC; dates passed in are ISO strings cast to
 * timestamp, so the result never depends on the session's time zone.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async metrics(
    period: MetricsPeriod = MetricsPeriod.Month,
    now: Date = new Date(),
  ): Promise<ManagerMetrics> {
    const days = PERIOD_DAYS[period];
    const sinceDate = days === null ? null : new Date(now.getTime() - days * DAY_MS);
    // All time is a window that starts before anything existed.
    const since = (sinceDate ?? new Date(0)).toISOString();
    const today = now.toISOString().slice(0, 10);
    const staleBefore = new Date(
      now.getTime() - STALE_FUNDING_DAYS * DAY_MS,
    ).toISOString();
    const weekStarts = weeksEndingAt(now);
    const seriesFrom = weekStarts[0].toISOString();

    const [users, verification, jobs, contracts, milestones, disputes, weeks] =
      await Promise.all([
        this.prisma.$queryRaw<UserRow[]>`
          SELECT
            COUNT(*) FILTER (WHERE role = 'startup')::int AS startups,
            COUNT(*) FILTER (WHERE role = 'startup' AND created_at >= ${since}::timestamp)::int AS new_startups,
            COUNT(*) FILTER (WHERE role = 'specialist')::int AS specialists,
            COUNT(*) FILTER (WHERE role = 'specialist' AND created_at >= ${since}::timestamp)::int AS new_specialists
          FROM users`,
        this.prisma.$queryRaw<VerificationRow[]>`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'approved' AND reviewed_at >= ${since}::timestamp)::int AS approved,
            COUNT(*) FILTER (WHERE status = 'rejected' AND reviewed_at >= ${since}::timestamp)::int AS rejected,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (reviewed_at - submitted_at))::float8 / 3600
            ) FILTER (WHERE status = 'approved' AND reviewed_at >= ${since}::timestamp)
              AS median_hours_to_approve
          FROM verification_requests`,
        this.prisma.$queryRaw<JobRow[]>`
          SELECT
            COUNT(*) FILTER (WHERE created_at >= ${since}::timestamp)::int AS posted,
            COUNT(*) FILTER (WHERE status = 'open')::int AS open,
            (SELECT COUNT(*) FROM applications
              WHERE created_at >= ${since}::timestamp)::int AS applications,
            (SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a.job_id
              WHERE j.created_at >= ${since}::timestamp)::int AS applications_on_posted
          FROM jobs`,
        this.prisma.$queryRaw<ContractRow[]>`
          SELECT
            COUNT(*) FILTER (WHERE created_at >= ${since}::timestamp)::int AS offers_sent,
            COUNT(*) FILTER (
              WHERE status IN ${ACCEPTED_STATUSES} AND accepted_at >= ${since}::timestamp
            )::int AS offers_accepted,
            COUNT(*) FILTER (
              WHERE status = 'cancelled' AND cancelled_at >= ${since}::timestamp
            )::int AS offers_declined,
            COUNT(*) FILTER (WHERE status = 'awaiting_specialist')::int AS awaiting_reply,
            COUNT(*) FILTER (WHERE funded_at >= ${since}::timestamp)::int AS funded_count,
            COALESCE(SUM(amount) FILTER (WHERE funded_at >= ${since}::timestamp), 0) AS funded,
            COUNT(*) FILTER (
              WHERE status = 'awaiting_funding' AND accepted_at < ${staleBefore}::timestamp
            )::int AS stale_awaiting_funding,
            (
              SELECT percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (hires.first_accepted - hires.posted))::float8 / 86400
              )
              FROM (
                SELECT j.created_at AS posted, MIN(c.accepted_at) AS first_accepted
                FROM jobs j JOIN contracts c ON c.job_id = j.id
                WHERE c.status IN ${ACCEPTED_STATUSES}
                GROUP BY j.id, j.created_at
              ) hires
              WHERE hires.first_accepted >= ${since}::timestamp
            ) AS median_days_to_first_hire
          FROM contracts`,
        this.prisma.$queryRaw<MilestoneRow[]>`
          SELECT
            COALESCE(SUM(m.amount) FILTER (
              WHERE m.status = 'paid' AND m.paid_at >= ${since}::timestamp
            ), 0) AS released,
            COALESCE(SUM(m.amount) FILTER (
              WHERE c.status = 'active' AND m.status NOT IN ('paid', 'resolved')
            ), 0) AS in_escrow,
            COUNT(*) FILTER (
              WHERE c.status = 'active'
                -- Work still owed by the specialist: delivered ones wait on
                -- the startup, disputed ones are counted as disputes.
                AND m.status IN ('pending', 'changes_requested')
                AND m.due_date < ${today}::date
            )::int AS overdue
          FROM milestones m JOIN contracts c ON c.id = m.contract_id`,
        this.prisma.$queryRaw<DisputeRow[]>`
          SELECT
            COUNT(*) FILTER (WHERE status = 'open')::int AS open,
            COUNT(*) FILTER (
              WHERE status = 'resolved' AND resolved_at >= ${since}::timestamp
            )::int AS resolved,
            COALESCE(SUM(specialist_amount) FILTER (
              WHERE status = 'resolved' AND resolved_at >= ${since}::timestamp
            ), 0) AS to_specialists,
            COALESCE(SUM(startup_amount) FILTER (
              WHERE status = 'resolved' AND resolved_at >= ${since}::timestamp
            ), 0) AS to_startups
          FROM disputes`,
        this.prisma.$queryRaw<WeekRow[]>`
          SELECT 'users' AS series, date_trunc('week', created_at) AS week,
            COUNT(*)::int AS count, NULL::numeric AS amount
          FROM users
          WHERE role <> 'manager' AND created_at >= ${seriesFrom}::timestamp
          GROUP BY 2
          UNION ALL
          SELECT 'jobs', date_trunc('week', created_at), COUNT(*)::int, NULL
          FROM jobs WHERE created_at >= ${seriesFrom}::timestamp
          GROUP BY 2
          UNION ALL
          SELECT 'funded', date_trunc('week', funded_at), COUNT(*)::int, SUM(amount)
          FROM contracts WHERE funded_at >= ${seriesFrom}::timestamp
          GROUP BY 2
          UNION ALL
          SELECT 'released', date_trunc('week', paid_at), COUNT(*)::int, SUM(amount)
          FROM milestones WHERE status = 'paid' AND paid_at >= ${seriesFrom}::timestamp
          GROUP BY 2
          UNION ALL
          SELECT 'released', date_trunc('week', resolved_at), COUNT(*)::int, SUM(specialist_amount)
          FROM disputes WHERE status = 'resolved' AND resolved_at >= ${seriesFrom}::timestamp
          GROUP BY 2`,
      ]);

    const u = users[0];
    const v = verification[0];
    const j = jobs[0];
    const c = contracts[0];
    const m = milestones[0];
    const d = disputes[0];

    const jobsPosted = count(j?.posted);
    const fundedCount = count(c?.funded_count);
    const funded = decimal(c?.funded);
    const released = decimal(m?.released).plus(decimal(d?.to_specialists));

    return {
      period,
      since: sinceDate?.toISOString() ?? null,
      generatedAt: now.toISOString(),
      users: {
        startups: { total: count(u?.startups), newInPeriod: count(u?.new_startups) },
        specialists: {
          total: count(u?.specialists),
          newInPeriod: count(u?.new_specialists),
        },
        verification: {
          pending: count(v?.pending),
          approved: count(v?.approved),
          rejected: count(v?.rejected),
          medianHoursToApprove: rounded(v?.median_hours_to_approve),
        },
      },
      marketplace: {
        jobsPosted,
        openJobs: count(j?.open),
        applications: count(j?.applications),
        averageApplicationsPerJob:
          jobsPosted > 0
            ? Math.round((count(j?.applications_on_posted) / jobsPosted) * 10) / 10
            : null,
        offers: {
          sent: count(c?.offers_sent),
          accepted: count(c?.offers_accepted),
          declined: count(c?.offers_declined),
          withdrawn: null,
          awaitingReply: count(c?.awaiting_reply),
        },
        medianDaysToFirstHire: rounded(c?.median_days_to_first_hire),
      },
      money: {
        funded: usdc(funded),
        contractsFunded: fundedCount,
        averageContract: fundedCount > 0 ? usdc(funded.div(fundedCount)) : null,
        released: usdc(released),
        refunded: usdc(decimal(d?.to_startups)),
        inEscrow: usdc(decimal(m?.in_escrow)),
        pocketFee: pocketFeeOf(released),
      },
      health: {
        openDisputes: count(d?.open),
        disputesResolved: count(d?.resolved),
        overdueMilestones: count(m?.overdue),
        staleAwaitingFunding: count(c?.stale_awaiting_funding),
      },
      weekly: weeklySeries(weekStarts, weeks),
    };
  }
}

/** Pocket's fee on an amount, cut down to USDC's 7 decimals, never rounded up. */
export function pocketFeeOf(released: Prisma.Decimal): string {
  return released
    .times(POCKET_FEE_PERCENT)
    .div(100)
    .toDecimalPlaces(7, Prisma.Decimal.ROUND_DOWN)
    .toFixed();
}

/** Monday 00:00 UTC of each of the last SERIES_WEEKS weeks, oldest first. */
export function weeksEndingAt(now: Date): Date[] {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // getUTCDay is 0 on Sunday; Postgres' date_trunc('week') starts on Monday.
  const monday = midnight - ((now.getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from(
    { length: SERIES_WEEKS },
    (_, index) => new Date(monday - (SERIES_WEEKS - 1 - index) * WEEK_MS),
  );
}

function weeklySeries(weekStarts: Date[], rows: WeekRow[]): MetricsWeek[] {
  const byWeek = new Map(
    weekStarts.map((start) => [
      start.toISOString(),
      {
        newUsers: 0,
        jobsPosted: 0,
        funded: new Prisma.Decimal(0),
        released: new Prisma.Decimal(0),
      },
    ]),
  );
  for (const row of rows) {
    const week = byWeek.get(new Date(row.week).toISOString());
    if (!week) continue;
    if (row.series === 'users') week.newUsers += count(row.count);
    else if (row.series === 'jobs') week.jobsPosted += count(row.count);
    else if (row.series === 'funded') week.funded = week.funded.plus(decimal(row.amount));
    else week.released = week.released.plus(decimal(row.amount));
  }
  return [...byWeek].map(([weekStart, week]) => ({
    weekStart,
    newUsers: week.newUsers,
    jobsPosted: week.jobsPosted,
    funded: usdc(week.funded),
    released: usdc(week.released),
  }));
}

function count(value: Count | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function decimal(value: Amount | undefined): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}

/** USDC as a plain decimal string with at most its 7 decimals: "1250.5". */
function usdc(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(7).toFixed();
}

/** A median to one decimal, or null when there was nothing to measure. */
function rounded(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value * 10) / 10;
}

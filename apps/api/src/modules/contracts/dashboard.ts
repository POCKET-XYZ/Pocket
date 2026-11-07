import {
  afterFees,
  type ContractReport,
  type DashboardContract,
  type DashboardUpcoming,
  type DashboardWeek,
  type DeliveryTimes,
  type ServiceCategory,
  type SpecialistDashboard,
  type StartupDashboard,
} from '@pocket/shared';
import { Prisma } from '@prisma/client';
import { weeksEndingAt } from '../manager/metrics.service';
import { buildReport, endOfDayAnywhere, REPORT_INCLUDE } from './report';

/** What a dashboard is built from: each contract's report, and who it was with. */
export const DASHBOARD_INCLUDE = {
  ...REPORT_INCLUDE,
  specialist: {
    select: {
      id: true,
      specialistProfile: { select: { displayName: true, avatarUrl: true } },
    },
  },
  milestones: {
    orderBy: { position: 'asc' },
    include: {
      deliverables: { orderBy: { version: 'asc' }, include: { kpiResults: true } },
      disputes: { select: { id: true, specialistAmount: true } },
    },
  },
} satisfies Prisma.ContractInclude;

export type DashboardSource = Prisma.ContractGetPayload<{
  include: typeof DASHBOARD_INCLUDE;
}>;

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** How many upcoming deliveries a dashboard lists. */
const UPCOMING = 5;

const IN_PROGRESS = ['awaiting_specialist', 'awaiting_funding', 'active'];

const sum = (values: Prisma.Decimal[]) =>
  values.reduce((total, value) => total.plus(value), ZERO);

interface Payment {
  at: Date;
  /** What left the startup for this payment: the specialist's share and the fees. */
  spent: Prisma.Decimal;
  /** What reached the specialist. */
  collected: Prisma.Decimal;
}

/**
 * Each payment as Stellar recorded it. One whose split could not be read yet is
 * worked out from its amount, so it still counts; the report of the contract
 * reads it from the network the next time it is opened.
 */
function paymentsOf(source: DashboardSource): Payment[] {
  return source.chainOperations.flatMap((operation) => {
    const milestone = source.milestones.find((each) => each.id === operation.milestoneId);
    if (!milestone || !operation.confirmedAt) return [];
    if (operation.payoutsReadAt) {
      const to = (matches: (recipient: string) => boolean) =>
        sum(
          operation.payouts
            .filter((payout) => matches(payout.recipient))
            .map((payout) => payout.amount),
        );
      return [
        {
          at: operation.confirmedAt,
          spent: to((recipient) => recipient !== 'startup'),
          collected: to((recipient) => recipient === 'specialist'),
        },
      ];
    }
    const share =
      operation.kind === 'release'
        ? milestone.amount
        : (milestone.disputes.at(-1)?.specialistAmount ?? ZERO);
    return [
      {
        at: operation.confirmedAt,
        spent: share,
        collected: new Prisma.Decimal(afterFees(share.toString())),
      },
    ];
  });
}

/** Twelve weeks, oldest first, each with the total of what happened in it. */
function weeksOf(
  entries: { at: Date; amount: Prisma.Decimal }[],
  now: Date,
): DashboardWeek[] {
  return weeksEndingAt(now).map((start) => {
    const end = start.getTime() + WEEK_MS;
    return {
      weekStart: start.toISOString(),
      amount: sum(
        entries
          .filter(({ at }) => at.getTime() >= start.getTime() && at.getTime() < end)
          .map(({ amount }) => amount),
      ).toString(),
    };
  });
}

/** Deliveries still to come in contracts under way, the soonest first. */
function upcomingOf(sources: DashboardSource[]): DashboardUpcoming[] {
  return sources
    .filter((source) => source.status === 'active')
    .flatMap((source) =>
      source.milestones
        .filter((milestone) =>
          ['pending', 'changes_requested'].includes(milestone.status),
        )
        .map((milestone) => ({
          contractId: source.id,
          jobTitle: source.job.title,
          milestoneTitle: milestone.title,
          dueDate: milestone.dueDate.toISOString(),
          amount: milestone.amount.toString(),
        })),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, UPCOMING);
}

/**
 * Targets judged so far: a contract still waiting for its results does not
 * count against anyone.
 */
export function judgedKpis(report: ContractReport): { withTarget: number; met: number } {
  const judged = report.kpis.filter(
    (kpi) => kpi.outcome === 'met' || kpi.outcome === 'not_met',
  );
  return {
    withTarget: judged.length,
    met: judged.filter((kpi) => kpi.outcome === 'met').length,
  };
}

/**
 * Days a delivery came in before its date. On time, it is the time left in the
 * day committed to, in UTC, so a delivery made on the day is 0 and never
 * reads as late; late, it is the time past the end of that day everywhere, the
 * same deadline that makes it late.
 */
export function daysEarly(dueDate: Date, deliveredAt: Date): number {
  const late = deliveredAt.getTime() - endOfDayAnywhere(dueDate).getTime();
  if (late > 0) return -Math.ceil(late / DAY_MS);
  const endOfDay = dueDate.getTime() + DAY_MS;
  return Math.max(0, Math.floor((endOfDay - deliveredAt.getTime()) / DAY_MS));
}

/** Delivery times over the milestones delivered in these reports. */
export function deliveryOf(reports: ContractReport[]): DeliveryTimes {
  const days = reports.flatMap((report) =>
    report.milestones.flatMap((milestone) =>
      milestone.firstDeliveredAt
        ? [daysEarly(new Date(milestone.dueDate), new Date(milestone.firstDeliveredAt))]
        : [],
    ),
  );
  if (days.length === 0) return { measured: 0, averageDaysEarly: null };
  const average = days.reduce((total, value) => total + value, 0) / days.length;
  return { measured: days.length, averageDaysEarly: Math.round(average * 10) / 10 || 0 };
}

function totals(reports: ContractReport[]) {
  return {
    contracts: {
      active: reports.filter((report) => IN_PROGRESS.includes(report.contract.status))
        .length,
      completed: reports.filter((report) => report.contract.status === 'completed')
        .length,
    },
    kpis: reports.reduce(
      (all, report) => {
        const kpis = judgedKpis(report);
        return { withTarget: all.withTarget + kpis.withTarget, met: all.met + kpis.met };
      },
      { withTarget: 0, met: 0 },
    ),
    milestones: reports.reduce(
      (all, { summary: { milestones } }) => ({
        total: all.total + milestones.total,
        done: all.done + milestones.done,
        onTime: all.onTime + milestones.onTime,
        late: all.late + milestones.late,
      }),
      { total: 0, done: 0, onTime: 0, late: 0 },
    ),
    delivery: deliveryOf(reports),
  };
}

export function startupDashboard(all: DashboardSource[], now: Date): StartupDashboard {
  const sources = all.filter((source) => source.status !== 'cancelled');
  const reports = sources.map((source) => buildReport(source, now));
  const payments = sources.map((source) => ({ source, payments: paymentsOf(source) }));

  const byCategory = new Map<ServiceCategory, Prisma.Decimal>();
  for (const { source, payments: paid } of payments) {
    const spent = sum(paid.map((payment) => payment.spent));
    if (spent.gt(0)) {
      byCategory.set(
        source.job.category,
        (byCategory.get(source.job.category) ?? ZERO).plus(spent),
      );
    }
  }

  const specialists = new Map<string, StartupDashboard['specialists'][number]>();
  sources.forEach((source, index) => {
    const kpis = judgedKpis(reports[index] as ContractReport);
    const seen = specialists.get(source.specialist.id);
    specialists.set(source.specialist.id, {
      id: source.specialist.id,
      displayName: source.specialist.specialistProfile?.displayName ?? null,
      avatarUrl: source.specialist.specialistProfile?.avatarUrl ?? null,
      contracts: (seen?.contracts ?? 0) + 1,
      kpis: {
        withTarget: (seen?.kpis.withTarget ?? 0) + kpis.withTarget,
        met: (seen?.kpis.met ?? 0) + kpis.met,
      },
    });
  });

  const order = sources
    .map((source, index) => ({ source, index }))
    .sort(
      (a, b) =>
        Number(IN_PROGRESS.includes(b.source.status)) -
          Number(IN_PROGRESS.includes(a.source.status)) ||
        b.source.createdAt.getTime() - a.source.createdAt.getTime(),
    );
  const byContract: DashboardContract[] = order.map(({ source, index }) => {
    const report = reports[index] as ContractReport;
    return {
      contractId: source.id,
      jobTitle: source.job.title,
      status: source.status,
      specialist: {
        id: source.specialist.id,
        displayName: source.specialist.specialistProfile?.displayName ?? null,
      },
      kpis: judgedKpis(report),
      milestones: report.summary.milestones,
      delivery: deliveryOf([report]),
      spent: sum(
        (payments[index]?.payments ?? []).map((payment) => payment.spent),
      ).toString(),
    };
  });

  return {
    spent: sum(
      payments.flatMap(({ payments: paid }) => paid.map((payment) => payment.spent)),
    ).toString(),
    held: sum(
      reports.map((report) => new Prisma.Decimal(report.money.inEscrow)),
    ).toString(),
    ...totals(reports),
    weeks: weeksOf(
      payments.flatMap(({ payments: paid }) =>
        paid.map((payment) => ({ at: payment.at, amount: payment.spent })),
      ),
      now,
    ),
    byCategory: [...byCategory.entries()]
      .sort(([, a], [, b]) => b.comparedTo(a))
      .map(([category, spent]) => ({ category, spent: spent.toString() })),
    specialists: [...specialists.values()],
    byContract,
    upcoming: upcomingOf(sources),
  };
}

export function specialistDashboard(
  all: DashboardSource[],
  now: Date,
): SpecialistDashboard {
  const sources = all.filter((source) => source.status !== 'cancelled');
  const reports = sources.map((source) => buildReport(source, now));
  const payments = sources.flatMap(paymentsOf);
  // Each milestone is charged on its own, as the escrow does when it pays.
  const toCollect = sources
    .filter((source) => source.status === 'active')
    .flatMap((source) =>
      source.milestones
        .filter((milestone) => !['paid', 'resolved'].includes(milestone.status))
        .map((milestone) => new Prisma.Decimal(afterFees(milestone.amount.toString()))),
    );

  return {
    collected: sum(payments.map((payment) => payment.collected)).toString(),
    toCollect: sum(toCollect).toString(),
    ...totals(reports),
    weeks: weeksOf(
      payments.map((payment) => ({ at: payment.at, amount: payment.collected })),
      now,
    ),
    upcoming: upcomingOf(sources),
  };
}

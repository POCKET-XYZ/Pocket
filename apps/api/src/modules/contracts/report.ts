import type {
  ContractReport,
  KpiOutcome,
  MilestoneTiming,
  PayoutBreakdown,
  ReportKpi,
  ReportPayment,
} from '@pocket/shared';
import { Prisma, type KpiDirection } from '@prisma/client';

/** What a results report is built from. */
export const REPORT_INCLUDE = {
  job: {
    select: {
      id: true,
      title: true,
      category: true,
      kpis: { orderBy: { position: 'asc' } },
    },
  },
  startup: { select: { id: true, startupProfile: { select: { companyName: true } } } },
  specialist: {
    select: { id: true, specialistProfile: { select: { displayName: true } } },
  },
  milestones: {
    orderBy: { position: 'asc' },
    include: {
      deliverables: { orderBy: { version: 'asc' }, include: { kpiResults: true } },
      disputes: { select: { id: true } },
    },
  },
  chainOperations: {
    where: { status: 'confirmed', kind: { in: ['release', 'resolve'] } },
    orderBy: { confirmedAt: 'asc' },
    include: { payouts: true },
  },
} satisfies Prisma.ContractInclude;

export type ReportSource = Prisma.ContractGetPayload<{ include: typeof REPORT_INCLUDE }>;

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 86_400_000;

/**
 * The moment a calendar day is over everywhere: its end at UTC-12, 36 hours
 * after it starts in UTC. A delivery made on the committed day, wherever the
 * specialist is, is on time.
 */
export function endOfDayAnywhere(day: Date): Date {
  return new Date(day.getTime() + 1.5 * DAY_MS);
}

/** A milestone's first delivery against the day committed to. */
export function milestoneTiming(
  dueDate: Date,
  firstDeliveredAt: Date | null,
  now: Date,
): MilestoneTiming {
  const deadline = endOfDayAnywhere(dueDate);
  if (firstDeliveredAt) return firstDeliveredAt <= deadline ? 'on_time' : 'late';
  return now > deadline ? 'late' : 'upcoming';
}

/**
 * Whether a result meets a numeric target, and by how much when more is
 * better. Without a numeric target the KPI is only tracked; without a number
 * in the result it is not measured yet.
 */
export function kpiOutcome(
  targetValue: Prisma.Decimal | null,
  direction: KpiDirection | null,
  result: Prisma.Decimal | null,
): { outcome: KpiOutcome; percent: number | null } {
  if (targetValue === null || direction === null)
    return { outcome: 'tracked', percent: null };
  if (result === null) return { outcome: 'not_measured', percent: null };
  if (direction === 'less_is_better') {
    return { outcome: result.lte(targetValue) ? 'met' : 'not_met', percent: null };
  }
  return {
    outcome: result.gte(targetValue) ? 'met' : 'not_met',
    // A floor of 0 is refused when the KPI is posted.
    percent: targetValue.gt(0)
      ? result.div(targetValue).mul(100).round().toNumber()
      : null,
  };
}

/**
 * The results report of a contract: each KPI against its target, using the
 * latest delivery the startup approved; each milestone against its date; and
 * every payment as Stellar recorded it.
 */
export function buildReport(source: ReportSource, now: Date): ContractReport {
  const milestones = source.milestones.map((milestone) => {
    const firstDeliveredAt = milestone.deliverables[0]?.createdAt ?? null;
    return {
      id: milestone.id,
      position: milestone.position,
      title: milestone.title,
      amount: milestone.amount.toString(),
      status: milestone.status,
      dueDate: milestone.dueDate.toISOString(),
      firstDeliveredAt: firstDeliveredAt?.toISOString() ?? null,
      approvedAt: milestone.approvedAt?.toISOString() ?? null,
      paidAt: milestone.paidAt?.toISOString() ?? null,
      timing: milestoneTiming(milestone.dueDate, firstDeliveredAt, now),
      deliveries: milestone.deliverables.length,
      changeRounds: milestone.revisionsUsed,
      disputed: milestone.disputes.length > 0,
    };
  });

  // The results the startup accepted last: an approval covers the latest
  // version of that milestone. A milestone settled by a dispute was not.
  const accepted = source.milestones
    .filter((milestone) => milestone.approvedAt && milestone.deliverables.length > 0)
    .sort((a, b) => b.approvedAt!.getTime() - a.approvedAt!.getTime())[0];
  const acceptedDelivery = accepted?.deliverables.at(-1);

  const kpis: ReportKpi[] = source.job.kpis.map((kpi) => {
    const result = acceptedDelivery?.kpiResults.find((r) => r.kpiId === kpi.id);
    return {
      id: kpi.id,
      name: kpi.name,
      unit: kpi.unit,
      target: kpi.target,
      targetValue: kpi.targetValue?.toString() ?? null,
      direction: kpi.direction,
      result: result
        ? {
            value: result.value,
            numericValue: result.numericValue?.toString() ?? null,
            comment: result.comment,
            milestoneTitle: accepted.title,
            approvedAt: accepted.approvedAt?.toISOString() ?? null,
          }
        : null,
      ...kpiOutcome(kpi.targetValue, kpi.direction, result?.numericValue ?? null),
    };
  });

  const byMilestone = new Map(source.milestones.map((m) => [m.id, m]));
  const payments: ReportPayment[] = source.chainOperations.flatMap((operation) => {
    const milestone = operation.milestoneId
      ? byMilestone.get(operation.milestoneId)
      : null;
    if (!milestone || (operation.kind !== 'release' && operation.kind !== 'resolve')) {
      return [];
    }
    return [
      {
        milestoneId: milestone.id,
        milestonePosition: milestone.position,
        milestoneTitle: milestone.title,
        kind: operation.kind,
        txHash: operation.txHash,
        confirmedAt: operation.confirmedAt?.toISOString() ?? null,
        amount: milestone.amount.toString(),
        breakdown: operation.payoutsReadAt ? breakdownOf(operation.payouts) : null,
      },
    ];
  });

  const done = source.milestones.filter(
    (m) => m.status === 'paid' || m.status === 'resolved',
  );
  const deposited = source.fundedAt ? source.amount : ZERO;
  const released = sum(done.map((m) => m.amount));
  const read = payments.flatMap((payment) =>
    payment.breakdown ? [payment.breakdown] : [],
  );
  const total = (key: keyof PayoutBreakdown) =>
    sum(read.map((breakdown) => new Prisma.Decimal(breakdown[key]))).toString();
  const paidMilestones = new Set(payments.map((payment) => payment.milestoneId));

  return {
    generatedAt: now.toISOString(),
    contract: {
      id: source.id,
      status: source.status,
      amount: source.amount.toString(),
      escrowId: source.escrowId,
      fundedAt: source.fundedAt?.toISOString() ?? null,
      completedAt: source.completedAt?.toISOString() ?? null,
      createdAt: source.createdAt.toISOString(),
    },
    job: { id: source.job.id, title: source.job.title, category: source.job.category },
    startup: {
      id: source.startup.id,
      companyName: source.startup.startupProfile?.companyName ?? null,
    },
    specialist: {
      id: source.specialist.id,
      displayName: source.specialist.specialistProfile?.displayName ?? null,
    },
    summary: {
      milestones: {
        total: milestones.length,
        done: done.length,
        onTime: milestones.filter((m) => m.timing === 'on_time').length,
        late: milestones.filter((m) => m.timing === 'late').length,
      },
      kpis: {
        withTarget: kpis.filter((kpi) => kpi.outcome !== 'tracked').length,
        met: kpis.filter((kpi) => kpi.outcome === 'met').length,
      },
      changeRounds: source.milestones.reduce((n, m) => n + m.revisionsUsed, 0),
      disputes: source.milestones.reduce((n, m) => n + m.disputes.length, 0),
    },
    money: {
      contract: source.amount.toString(),
      deposited: deposited.toString(),
      released: released.toString(),
      inEscrow: Prisma.Decimal.max(deposited.minus(released), ZERO).toString(),
      toSpecialist: total('specialist'),
      toStartup: total('startup'),
      pocketFee: total('pocket'),
      trustlessWorkFee: total('trustlessWork'),
      verified:
        read.length === payments.length && done.every((m) => paidMilestones.has(m.id)),
    },
    kpis,
    milestones,
    payments,
  };
}

function breakdownOf(
  payouts: { recipient: string; amount: Prisma.Decimal }[],
): PayoutBreakdown {
  const to = (recipient: string) =>
    sum(payouts.filter((p) => p.recipient === recipient).map((p) => p.amount)).toString();
  return {
    specialist: to('specialist'),
    startup: to('startup'),
    pocket: to('pocket'),
    trustlessWork: to('trustless_work'),
    other: to('other'),
  };
}

function sum(amounts: Prisma.Decimal[]): Prisma.Decimal {
  return amounts.reduce((total, amount) => total.plus(amount), ZERO);
}

const PAYMENT_KIND: Record<ReportPayment['kind'], string> = {
  release: 'Pago del hito',
  resolve: 'Resolución de disputa',
};

/**
 * The payments of a report as a CSV for accounting: one row per release or
 * resolution, amounts in USDC with a dot for decimals, and a link to each
 * transaction. Starts with a byte order mark so Excel reads the accents.
 */
export function reportCsv(
  report: ContractReport,
  explorerNetwork: 'public' | 'testnet',
): string {
  const header = [
    'Fecha (UTC)',
    'Hito',
    'Tipo',
    'Monto del hito (USDC)',
    'Al experto (USDC)',
    'Devuelto a la startup (USDC)',
    'Comisión de Pocket (USDC)',
    'Comisión de Trustless Work (USDC)',
    'Transacción',
    'Ver en Stellar',
  ];
  const rows = report.payments.map((payment) => [
    payment.confirmedAt?.slice(0, 10) ?? '',
    `${payment.milestonePosition + 1}. ${payment.milestoneTitle}`,
    PAYMENT_KIND[payment.kind],
    payment.amount,
    payment.breakdown?.specialist ?? '',
    payment.breakdown?.startup ?? '',
    payment.breakdown?.pocket ?? '',
    payment.breakdown?.trustlessWork ?? '',
    payment.txHash,
    `https://stellar.expert/explorer/${explorerNetwork}/tx/${payment.txHash}`,
  ]);
  return (
    '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  );
}

/**
 * One CSV cell: quoted when it holds a comma, a quote or a line break, and
 * never read as a formula, since titles are typed by users.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

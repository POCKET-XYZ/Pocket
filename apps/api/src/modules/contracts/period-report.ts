import type {
  ContractReport,
  PeriodPayment,
  PeriodReport,
  PayoutBreakdown,
} from '@pocket/shared';
import { Prisma } from '@prisma/client';
import { deliveryOf, judgedKpis } from './dashboard';
import { buildReport, csvCell, PAYMENT_KIND, type ReportSource } from './report';

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 86_400_000;
/** The longest period a report covers: two years. */
export const MAX_PERIOD_DAYS = 731;

/** A period of whole UTC days: from the start of `from` to the end of `to`. */
export interface Period {
  /** YYYY-MM-DD, included. */
  from: string;
  /** YYYY-MM-DD, included. */
  to: string;
}

/** Whether a timestamp falls within the period's days. */
function within(period: Period, value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const at = new Date(value).getTime();
  const start = Date.parse(`${period.from}T00:00:00Z`);
  const end = Date.parse(`${period.to}T00:00:00Z`) + DAY_MS;
  return at >= start && at < end;
}

/**
 * The month so far when no dates are given; otherwise the dates as asked.
 * Throws a message for the reader when they make no period.
 */
export function periodOf(
  from: string | undefined,
  to: string | undefined,
  now: Date,
): Period {
  const today = now.toISOString().slice(0, 10);
  const period = { from: from ?? `${today.slice(0, 8)}01`, to: to ?? today };
  const start = Date.parse(`${period.from}T00:00:00Z`);
  const end = Date.parse(`${period.to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new Error('Esa fecha no existe');
  if (start > end) throw new Error('La fecha de inicio va antes de la fecha de fin');
  if ((end - start) / DAY_MS + 1 > MAX_PERIOD_DAYS) {
    throw new Error('Un reporte cubre como mucho dos años');
  }
  return period;
}

const sum = (values: Prisma.Decimal[]) =>
  values.reduce((total, value) => total.plus(value), ZERO);

/**
 * What a startup or a specialist did in a period, over all their contracts:
 * the money that moved, each payment with its transaction, the milestones
 * delivered and the results approved. A contract shows up when something of it
 * happened in the period: its deposit, a delivery, an approval or a payment.
 */
export function periodReport(
  sources: ReportSource[],
  party: PeriodReport['party'],
  period: Period,
  now: Date,
): PeriodReport {
  const reports = sources.map((source) => buildReport(source, now));

  const payments: PeriodPayment[] = reports.flatMap((report) =>
    report.payments
      .filter((payment) => within(period, payment.confirmedAt))
      .map((payment) => ({
        ...payment,
        contractId: report.contract.id,
        jobTitle: report.job.title,
      })),
  );
  payments.sort((a, b) => (a.confirmedAt ?? '').localeCompare(b.confirmedAt ?? ''));

  const delivered = (report: ContractReport) =>
    report.milestones.filter((milestone) => within(period, milestone.firstDeliveredAt));
  const approvedKpis = (report: ContractReport) =>
    judgedKpis({
      ...report,
      kpis: report.kpis.filter((kpi) => within(period, kpi.result?.approvedAt)),
    });
  const funded = reports.filter((report) => within(period, report.contract.fundedAt));

  const contracts = reports
    .filter(
      (report) =>
        within(period, report.contract.fundedAt) ||
        delivered(report).length > 0 ||
        approvedKpis(report).withTarget > 0 ||
        payments.some((payment) => payment.contractId === report.contract.id),
    )
    .map((report) => ({
      contractId: report.contract.id,
      jobTitle: report.job.title,
      status: report.contract.status,
      counterpart:
        party.role === 'startup'
          ? report.specialist.displayName
          : report.startup.companyName,
      kpis: approvedKpis(report),
      milestonesDelivered: delivered(report).length,
      released: sum(
        payments
          .filter((payment) => payment.contractId === report.contract.id)
          .map((payment) => new Prisma.Decimal(payment.amount)),
      ).toString(),
    }));

  const milestones = reports.flatMap(delivered);
  const read = payments.flatMap((payment) =>
    payment.breakdown ? [payment.breakdown] : [],
  );
  const total = (key: keyof PayoutBreakdown) =>
    sum(read.map((breakdown) => new Prisma.Decimal(breakdown[key]))).toString();

  return {
    generatedAt: now.toISOString(),
    from: period.from,
    to: period.to,
    party,
    money: {
      deposited: sum(
        funded.map((report) => new Prisma.Decimal(report.contract.amount)),
      ).toString(),
      released: sum(
        payments.map((payment) => new Prisma.Decimal(payment.amount)),
      ).toString(),
      toSpecialist: total('specialist'),
      toStartup: total('startup'),
      pocketFee: total('pocket'),
      trustlessWorkFee: total('trustlessWork'),
      verified: read.length === payments.length,
    },
    kpis: contracts.reduce(
      (all, contract) => ({
        withTarget: all.withTarget + contract.kpis.withTarget,
        met: all.met + contract.kpis.met,
      }),
      { withTarget: 0, met: 0 },
    ),
    milestones: {
      delivered: milestones.length,
      onTime: milestones.filter((milestone) => milestone.timing === 'on_time').length,
      late: milestones.filter((milestone) => milestone.timing === 'late').length,
    },
    delivery: deliveryOf(
      reports.map((report) => ({ ...report, milestones: delivered(report) })),
    ),
    contracts,
    payments,
  };
}

/**
 * The payments of a period as a CSV for accounting, one row per release or
 * resolution, with the contract each belongs to and a link to its transaction.
 */
export function periodCsv(
  report: PeriodReport,
  explorerNetwork: 'public' | 'testnet',
): string {
  const header = [
    'Fecha (UTC)',
    'Contrato',
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
    payment.jobTitle,
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

import { Prisma } from '@prisma/client';
import { periodCsv, periodOf, periodReport } from './period-report';
import type { ReportSource } from './report';

const D = (value: number | string) => new Prisma.Decimal(value);
const NOW = new Date('2026-11-25T15:00:00Z');
const STARTUP = { id: 's1', role: 'startup' as const, name: 'Andes' };

function milestone(overrides: Record<string, unknown>) {
  return {
    id: 'm1',
    position: 0,
    title: 'First',
    amount: D(2),
    status: 'pending',
    dueDate: new Date('2026-11-10'),
    revisionsUsed: 0,
    approvedAt: null,
    paidAt: null,
    deliverables: [],
    disputes: [],
    ...overrides,
  };
}

function operation(
  milestoneId: string,
  kind: 'release' | 'resolve',
  at: string,
  read = true,
) {
  return {
    id: `op-${milestoneId}`,
    kind,
    milestoneId,
    txHash: `hash-${milestoneId}`,
    confirmedAt: new Date(at),
    payoutsReadAt: read ? new Date(at) : null,
    payouts: read
      ? [
          { recipient: 'specialist', amount: D('1.974') },
          { recipient: 'pocket', amount: D('0.02') },
          { recipient: 'trustless_work', amount: D('0.006') },
        ]
      : [],
  };
}

function contract(overrides: Record<string, unknown>): ReportSource {
  return {
    id: 'c1',
    amount: D(4),
    status: 'active',
    escrowId: 'CESCROW',
    fundedAt: new Date('2026-10-20'),
    completedAt: null,
    createdAt: new Date('2026-10-19'),
    job: {
      id: 'j1',
      title: 'Leads',
      category: 'growth',
      kpis: [
        {
          id: 'k1',
          name: 'Leads',
          unit: null,
          target: '100',
          targetValue: D(100),
          direction: 'more_is_better',
          position: 0,
        },
      ],
    },
    startup: { id: 's1', startupProfile: { companyName: 'Andes' } },
    specialist: { id: 'e1', specialistProfile: { displayName: 'Lucía' } },
    milestones: [],
    chainOperations: [],
    ...overrides,
  } as unknown as ReportSource;
}

// Funded in October; first milestone delivered and paid in October, second
// delivered a day late and paid in November with its results approved then.
const LEADS = contract({
  milestones: [
    milestone({
      id: 'm1',
      dueDate: new Date('2026-10-25'),
      status: 'paid',
      approvedAt: new Date('2026-10-26'),
      deliverables: [
        { version: 1, createdAt: new Date('2026-10-24T10:00:00Z'), kpiResults: [] },
      ],
    }),
    milestone({
      id: 'm2',
      position: 1,
      title: 'Second',
      dueDate: new Date('2026-11-05'),
      status: 'paid',
      approvedAt: new Date('2026-11-07'),
      deliverables: [
        {
          version: 1,
          createdAt: new Date('2026-11-06T13:00:00Z'),
          kpiResults: [
            { kpiId: 'k1', value: '120', numericValue: D(120), comment: null },
          ],
        },
      ],
    }),
  ],
  chainOperations: [
    operation('m1', 'release', '2026-10-26T10:00:00Z'),
    operation('m2', 'release', '2026-11-07T10:00:00Z'),
  ],
});

// Funded in November, nothing delivered yet.
const ADS = contract({
  id: 'c2',
  amount: D(3),
  fundedAt: new Date('2026-11-12T09:00:00Z'),
  job: { id: 'j2', title: 'Ads, "Q4"', category: 'marketing', kpis: [] },
  milestones: [milestone({ id: 'm3', dueDate: new Date('2026-12-01'), amount: D(3) })],
});

const NOVEMBER = { from: '2026-11-01', to: '2026-11-30' };

describe('periodOf', () => {
  it('covers the month so far when no dates are given', () => {
    expect(periodOf(undefined, undefined, NOW)).toEqual({
      from: '2026-11-01',
      to: '2026-11-25',
    });
  });

  it('refuses a period that ends before it starts, or longer than two years', () => {
    expect(() => periodOf('2026-11-10', '2026-11-01', NOW)).toThrow('va antes');
    expect(() => periodOf('2023-01-01', '2026-11-01', NOW)).toThrow('dos años');
    expect(() => periodOf('2026-02-31x', '2026-03-01', NOW)).toThrow('no existe');
  });
});

describe('periodReport', () => {
  it('keeps only the payments, deliveries and approvals of the period', () => {
    const report = periodReport([LEADS, ADS], STARTUP, NOVEMBER, NOW);
    expect(report.payments.map((payment) => payment.txHash)).toEqual(['hash-m2']);
    expect(report.payments[0]).toMatchObject({ contractId: 'c1', jobTitle: 'Leads' });
    expect(report.money).toEqual({
      deposited: '3',
      released: '2',
      toSpecialist: '1.974',
      toStartup: '0',
      pocketFee: '0.02',
      trustlessWorkFee: '0.006',
      verified: true,
    });
    expect(report.kpis).toEqual({ withTarget: 1, met: 1 });
    expect(report.milestones).toEqual({ delivered: 1, onTime: 0, late: 1 });
    expect(report.delivery).toEqual({ measured: 1, averageDaysEarly: -1 });
  });

  it('lists each contract with something in the period, with its counterpart', () => {
    const report = periodReport([LEADS, ADS], STARTUP, NOVEMBER, NOW);
    expect(report.contracts).toEqual([
      {
        contractId: 'c1',
        jobTitle: 'Leads',
        status: 'active',
        counterpart: 'Lucía',
        kpis: { withTarget: 1, met: 1 },
        milestonesDelivered: 1,
        released: '2',
      },
      {
        contractId: 'c2',
        jobTitle: 'Ads, "Q4"',
        status: 'active',
        counterpart: 'Lucía',
        kpis: { withTarget: 0, met: 0 },
        milestonesDelivered: 0,
        released: '0',
      },
    ]);
  });

  it('names the startup to a specialist', () => {
    const report = periodReport(
      [LEADS],
      { id: 'e1', role: 'specialist', name: 'Lucía' },
      NOVEMBER,
      NOW,
    );
    expect(report.contracts[0]?.counterpart).toBe('Andes');
  });

  it('leaves out a contract with nothing in the period', () => {
    const report = periodReport(
      [LEADS, ADS],
      STARTUP,
      { from: '2026-09-01', to: '2026-09-30' },
      NOW,
    );
    expect(report.contracts).toEqual([]);
    expect(report.delivery).toEqual({ measured: 0, averageDaysEarly: null });
  });

  it('includes the last day of the period up to its end', () => {
    const report = periodReport(
      [LEADS],
      STARTUP,
      { from: '2026-10-01', to: '2026-10-26' },
      NOW,
    );
    expect(report.payments.map((payment) => payment.txHash)).toEqual(['hash-m1']);
  });

  it('says when a split is still to be read from Stellar', () => {
    const unread = contract({
      milestones: [milestone({ id: 'm1', status: 'paid' })],
      chainOperations: [operation('m1', 'release', '2026-11-03T10:00:00Z', false)],
    });
    expect(periodReport([unread], STARTUP, NOVEMBER, NOW).money.verified).toBe(false);
  });
});

describe('periodCsv', () => {
  it('has a row per payment with its contract and a link to the transaction', () => {
    const csv = periodCsv(periodReport([LEADS], STARTUP, NOVEMBER, NOW), 'public');
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '2026-11-07,Leads,2. Second,Pago del hito,2,1.974,0,0.02,0.006,hash-m2,https://stellar.expert/explorer/public/tx/hash-m2',
    );
  });
});

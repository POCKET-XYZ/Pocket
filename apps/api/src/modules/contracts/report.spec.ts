import { Prisma } from '@prisma/client';
import {
  buildReport,
  endOfDayAnywhere,
  kpiOutcome,
  milestoneTiming,
  reportCsv,
  type ReportSource,
} from './report';
import { classifyPayouts } from './payouts';

const D = (value: number | string) => new Prisma.Decimal(value);
const NOW = new Date('2026-11-30T15:00:00Z');

describe('endOfDayAnywhere', () => {
  it('ends a day at midnight UTC-12', () => {
    expect(endOfDayAnywhere(new Date('2026-11-10T00:00:00Z')).toISOString()).toBe(
      '2026-11-11T12:00:00.000Z',
    );
  });
});

describe('milestoneTiming', () => {
  const due = new Date('2026-11-10T00:00:00Z');

  it('counts a delivery late on the committed day, in the Americas, as on time', () => {
    // 11 pm in Mexico City on Nov 10.
    expect(milestoneTiming(due, new Date('2026-11-11T05:00:00Z'), NOW)).toBe('on_time');
  });

  it('counts a delivery the next day as late', () => {
    expect(milestoneTiming(due, new Date('2026-11-11T13:00:00Z'), NOW)).toBe('late');
  });

  it('counts an undelivered milestone as late only once its day is over', () => {
    expect(milestoneTiming(due, null, new Date('2026-11-11T11:00:00Z'))).toBe('upcoming');
    expect(milestoneTiming(due, null, new Date('2026-11-11T13:00:00Z'))).toBe('late');
  });
});

describe('kpiOutcome', () => {
  it('meets a floor at or above it, with how far', () => {
    expect(kpiOutcome(D(100), 'more_is_better', D(124))).toEqual({
      outcome: 'met',
      percent: 124,
    });
    expect(kpiOutcome(D(100), 'more_is_better', D(100))).toEqual({
      outcome: 'met',
      percent: 100,
    });
    expect(kpiOutcome(D(100), 'more_is_better', D(62))).toEqual({
      outcome: 'not_met',
      percent: 62,
    });
  });

  it('meets a ceiling at or under it, without a percent', () => {
    expect(kpiOutcome(D(5), 'less_is_better', D('4.2'))).toEqual({
      outcome: 'met',
      percent: null,
    });
    expect(kpiOutcome(D(5), 'less_is_better', D('5.01'))).toEqual({
      outcome: 'not_met',
      percent: null,
    });
    expect(kpiOutcome(D(0), 'less_is_better', D(0))).toEqual({
      outcome: 'met',
      percent: null,
    });
  });

  it('tells apart a KPI not measured yet from one only tracked', () => {
    expect(kpiOutcome(D(100), 'more_is_better', null).outcome).toBe('not_measured');
    expect(kpiOutcome(null, null, D(3)).outcome).toBe('tracked');
  });
});

describe('classifyPayouts', () => {
  const parties = { specialist: 'GSPEC', startup: 'GSTART', pocket: 'GPOCKET' };

  it('names each recipient of a release, Trustless Work being the one left on mainnet', () => {
    expect(
      classifyPayouts(
        [
          { to: 'GTW', amount: '0.09' },
          { to: 'GPOCKET', amount: '0.3' },
          { to: 'GSPEC', amount: '29.61' },
        ],
        parties,
      ).map((p) => p.recipient),
    ).toEqual(['trustless_work', 'pocket', 'specialist']);
  });

  it('shows an unknown address as other when the fee address is known', () => {
    expect(
      classifyPayouts(
        [
          { to: 'GTW', amount: '0.09' },
          { to: 'GSTRANGER', amount: '1' },
          { to: 'GSTART', amount: '1' },
        ],
        { ...parties, trustlessWork: 'GTW' },
      ).map((p) => p.recipient),
    ).toEqual(['trustless_work', 'other', 'startup']);
  });
});

describe('buildReport', () => {
  const kpi = (fields: Partial<ReportSource['job']['kpis'][number]>) => ({
    id: 'kpi-leads',
    jobId: 'job-1',
    position: 0,
    name: 'Qualified leads',
    target: null,
    targetValue: D(100),
    direction: 'more_is_better' as const,
    unit: 'leads',
    ...fields,
  });
  const result = (kpiId: string, value: string, numericValue: Prisma.Decimal | null) => ({
    id: `r-${kpiId}-${value}`,
    deliverableId: 'd',
    kpiId,
    value,
    numericValue,
    comment: null,
  });
  const delivery = (
    version: number,
    createdAt: string,
    results: ReturnType<typeof result>[],
  ) => ({
    id: `d-${version}-${createdAt}`,
    milestoneId: 'm',
    version,
    url: 'https://example.com',
    note: null,
    feedback: null,
    createdAt: new Date(createdAt),
    kpiResults: results,
  });
  const milestone = (fields: Record<string, unknown>) => ({
    contractId: 'contract-1',
    description: 'Work',
    acceptanceCriteria: null,
    revisionsUsed: 0,
    approvedAt: null,
    paidAt: null,
    createdAt: new Date('2026-11-01'),
    updatedAt: new Date('2026-11-01'),
    deliverables: [],
    disputes: [],
    ...fields,
  });
  const payout = (recipient: string, amount: string) => ({
    id: `p-${recipient}`,
    operationId: 'op',
    recipient,
    address: `G${recipient}`,
    amount: D(amount),
  });

  function source(overrides: Partial<ReportSource> = {}): ReportSource {
    return {
      id: 'contract-1',
      jobId: 'job-1',
      applicationId: 'app-1',
      startupId: 'startup-1',
      specialistId: 'specialist-1',
      amount: D(1500),
      status: 'completed',
      escrowId: 'CESCROW',
      platformFeeBps: 100,
      acceptedAt: new Date('2026-11-01'),
      fundedAt: new Date('2026-11-02'),
      completedAt: new Date('2026-11-29'),
      cancelledAt: null,
      createdAt: new Date('2026-11-01'),
      updatedAt: new Date('2026-11-29'),
      job: {
        id: 'job-1',
        title: 'Launch campaign',
        category: 'growth',
        kpis: [
          kpi({}),
          kpi({
            id: 'kpi-cost',
            position: 1,
            name: 'Cost per lead',
            targetValue: D(5),
            direction: 'less_is_better',
            unit: 'USDC',
          }),
          kpi({
            id: 'kpi-brand',
            position: 2,
            name: 'Brand',
            targetValue: null,
            direction: null,
            target: 'Better',
            unit: null,
          }),
        ],
      },
      startup: { id: 'startup-1', startupProfile: { companyName: 'Vaquita' } },
      specialist: {
        id: 'specialist-1',
        specialistProfile: { displayName: 'Valeria M.' },
      },
      milestones: [
        milestone({
          id: 'm1',
          position: 0,
          title: 'Strategy',
          amount: D(500),
          dueDate: new Date('2026-11-10'),
          status: 'paid',
          revisionsUsed: 1,
          approvedAt: new Date('2026-11-10T10:00:00Z'),
          paidAt: new Date('2026-11-10T10:01:00Z'),
          deliverables: [
            delivery(1, '2026-11-08T10:00:00Z', [result('kpi-leads', '40', D(40))]),
            delivery(2, '2026-11-09T10:00:00Z', [result('kpi-leads', '45', D(45))]),
          ],
        }),
        milestone({
          id: 'm2',
          position: 1,
          title: 'Campaign',
          amount: D(1000),
          dueDate: new Date('2026-11-25'),
          status: 'paid',
          approvedAt: new Date('2026-11-28T10:00:00Z'),
          paidAt: new Date('2026-11-28T10:01:00Z'),
          deliverables: [
            delivery(1, '2026-11-27T10:00:00Z', [
              result('kpi-leads', '124', D(124)),
              result('kpi-cost', '4.2', D('4.2')),
              result('kpi-brand', 'Much better', null),
            ]),
          ],
        }),
      ],
      chainOperations: [
        {
          id: 'op-1',
          kind: 'release',
          status: 'confirmed',
          txHash: 'hash-1',
          signerId: null,
          contractId: 'contract-1',
          milestoneId: 'm1',
          amount: D(500),
          stepKey: 'release:m1',
          error: null,
          createdAt: new Date('2026-11-10'),
          confirmedAt: new Date('2026-11-10T10:01:00Z'),
          payoutsReadAt: new Date('2026-11-10T10:02:00Z'),
          payouts: [
            payout('specialist', '493.5'),
            payout('pocket', '5'),
            payout('trustless_work', '1.5'),
          ],
        },
        {
          id: 'op-2',
          kind: 'release',
          status: 'confirmed',
          txHash: 'hash-2',
          signerId: null,
          contractId: 'contract-1',
          milestoneId: 'm2',
          amount: D(1000),
          stepKey: 'release:m2',
          error: null,
          createdAt: new Date('2026-11-28'),
          confirmedAt: new Date('2026-11-28T10:01:00Z'),
          payoutsReadAt: new Date('2026-11-28T10:02:00Z'),
          payouts: [
            payout('specialist', '987'),
            payout('pocket', '10'),
            payout('trustless_work', '3'),
          ],
        },
      ],
      ...overrides,
    } as ReportSource;
  }

  it('scores each KPI on the latest delivery the startup approved', () => {
    const report = buildReport(source(), NOW);
    expect(
      report.kpis.map((k) => [k.name, k.result?.value, k.outcome, k.percent]),
    ).toEqual([
      ['Qualified leads', '124', 'met', 124],
      ['Cost per lead', '4.2', 'met', null],
      ['Brand', 'Much better', 'tracked', null],
    ]);
    expect(report.kpis[0].result?.milestoneTitle).toBe('Campaign');
    expect(report.summary.kpis).toEqual({ withTarget: 2, met: 2 });
  });

  it('dates each milestone against its committed day, from its first delivery', () => {
    const report = buildReport(source(), NOW);
    expect(
      report.milestones.map((m) => [m.title, m.timing, m.deliveries, m.changeRounds]),
    ).toEqual([
      ['Strategy', 'on_time', 2, 1],
      ['Campaign', 'late', 1, 0],
    ]);
    expect(report.summary.milestones).toEqual({ total: 2, done: 2, onTime: 1, late: 1 });
    expect(report.summary.changeRounds).toBe(1);
  });

  it('adds up the money as Stellar recorded it', () => {
    const report = buildReport(source(), NOW);
    expect(report.money).toEqual({
      contract: '1500',
      deposited: '1500',
      released: '1500',
      inEscrow: '0',
      toSpecialist: '1480.5',
      toStartup: '0',
      pocketFee: '15',
      trustlessWorkFee: '4.5',
      verified: true,
    });
    expect(report.payments[0]).toEqual({
      milestoneId: 'm1',
      milestonePosition: 0,
      milestoneTitle: 'Strategy',
      kind: 'release',
      txHash: 'hash-1',
      confirmedAt: '2026-11-10T10:01:00.000Z',
      amount: '500',
      breakdown: {
        specialist: '493.5',
        startup: '0',
        pocket: '5',
        trustlessWork: '1.5',
        other: '0',
      },
    });
  });

  it('says the money is not verified while a split was not read', () => {
    const base = source();
    const [first, second] = base.chainOperations;
    const report = buildReport(
      source({
        chainOperations: [first, { ...second, payoutsReadAt: null, payouts: [] }],
      }),
      NOW,
    );
    expect(report.payments[1].breakdown).toBeNull();
    expect(report.money.verified).toBe(false);
    expect(report.money.toSpecialist).toBe('493.5');
  });

  it('follows a contract still running: nothing accepted, money still in the escrow', () => {
    const base = source();
    const report = buildReport(
      source({
        status: 'active',
        completedAt: null,
        milestones: base.milestones.map((m) => ({
          ...m,
          status: 'pending',
          approvedAt: null,
          paidAt: null,
          deliverables: [],
        })),
        chainOperations: [],
      }),
      new Date('2026-11-05T00:00:00Z'),
    );
    expect(report.kpis.map((k) => k.outcome)).toEqual([
      'not_measured',
      'not_measured',
      'tracked',
    ]);
    expect(report.milestones.map((m) => m.timing)).toEqual(['upcoming', 'upcoming']);
    expect(report.money).toMatchObject({
      deposited: '1500',
      released: '0',
      inEscrow: '1500',
    });
    expect(report.money.verified).toBe(true);
  });

  it('writes the payments as a CSV Excel reads, quoting what the startup typed', () => {
    const base = source();
    const csv = reportCsv(
      buildReport(
        source({
          milestones: [
            { ...base.milestones[0], title: '=HYPERLINK("x"), launch' },
            base.milestones[1],
          ],
        }),
        NOW,
      ),
      'testnet',
    );
    expect(csv.startsWith('﻿Fecha (UTC),Hito,')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      `2026-11-10,"1. =HYPERLINK(""x""), launch",Pago del hito,500,493.5,0,5,1.5,hash-1,https://stellar.expert/explorer/testnet/tx/hash-1`,
    );
  });
});

import { Prisma } from '@prisma/client';
import {
  daysEarly,
  specialistDashboard,
  startupDashboard,
  type DashboardSource,
} from './dashboard';
import { trackRecordOf, type TrackRecordSource } from './track-record';

const D = (value: number | string) => new Prisma.Decimal(value);
// A Wednesday: its week starts on Monday, Nov 23.
const NOW = new Date('2026-11-25T15:00:00Z');

function milestone(overrides: Record<string, unknown>) {
  return {
    id: 'm1',
    position: 0,
    title: 'First',
    amount: D(2),
    status: 'pending',
    dueDate: new Date('2026-12-10'),
    revisionsUsed: 0,
    approvedAt: null,
    paidAt: null,
    deliverables: [],
    disputes: [],
    ...overrides,
  };
}

function delivered(at: string, results: unknown[] = []) {
  return { version: 1, createdAt: new Date(at), kpiResults: results };
}

function kpi(id: string, target: number) {
  return {
    id,
    name: id,
    unit: null,
    target: String(target),
    targetValue: D(target),
    direction: 'more_is_better',
    position: 0,
  };
}

function operation(
  milestoneId: string,
  kind: 'release' | 'resolve',
  at: string,
  payouts: { recipient: string; amount: Prisma.Decimal }[] | null,
) {
  return {
    id: `op-${milestoneId}`,
    kind,
    milestoneId,
    txHash: `hash-${milestoneId}`,
    confirmedAt: new Date(at),
    payoutsReadAt: payouts ? new Date(at) : null,
    payouts: payouts ?? [],
  };
}

function contract(overrides: Record<string, unknown> = {}): DashboardSource {
  return {
    id: 'c1',
    amount: D(3),
    status: 'active',
    escrowId: 'CESCROW',
    fundedAt: new Date('2026-11-01'),
    completedAt: null,
    createdAt: new Date('2026-11-01'),
    job: { id: 'j1', title: 'Leads', category: 'growth', kpis: [] },
    startup: { id: 's1', startupProfile: { companyName: 'Andes', sector: 'Café' } },
    specialist: {
      id: 'e1',
      specialistProfile: { displayName: 'Lucía', avatarUrl: null },
    },
    milestones: [],
    chainOperations: [],
    ...overrides,
  } as unknown as DashboardSource;
}

const PAID = [
  { recipient: 'specialist', amount: D('1.974') },
  { recipient: 'pocket', amount: D('0.02') },
  { recipient: 'trustless_work', amount: D('0.006') },
];

describe('startupDashboard', () => {
  it('adds what left the escrow and what is still in it', () => {
    const dashboard = startupDashboard(
      [
        contract({
          milestones: [
            milestone({ id: 'm1', status: 'paid', paidAt: new Date('2026-11-24') }),
            milestone({ id: 'm2', amount: D(1) }),
          ],
          chainOperations: [operation('m1', 'release', '2026-11-24T10:00:00Z', PAID)],
        }),
      ],
      NOW,
    );
    expect(dashboard.spent).toBe('2');
    expect(dashboard.held).toBe('1');
    expect(dashboard.contracts).toEqual({ active: 1, completed: 0 });
  });

  it('does not count what a split dispute gave back to the startup', () => {
    const dashboard = startupDashboard(
      [
        contract({
          status: 'completed',
          amount: D(1),
          milestones: [milestone({ id: 'm1', amount: D(1), status: 'resolved' })],
          chainOperations: [
            operation('m1', 'resolve', '2026-11-24T10:00:00Z', [
              { recipient: 'specialist', amount: D('0.5922') },
              { recipient: 'startup', amount: D('0.3948') },
              { recipient: 'pocket', amount: D('0.01') },
              { recipient: 'trustless_work', amount: D('0.003') },
            ]),
          ],
        }),
      ],
      NOW,
    );
    expect(dashboard.spent).toBe('0.6052');
    expect(dashboard.held).toBe('0');
  });

  it('still counts a payment whose split was not read yet', () => {
    const dashboard = startupDashboard(
      [
        contract({
          milestones: [milestone({ id: 'm1', status: 'paid' })],
          chainOperations: [operation('m1', 'release', '2026-11-24T10:00:00Z', null)],
        }),
      ],
      NOW,
    );
    expect(dashboard.spent).toBe('2');
  });

  it('puts each payment in its week, the current one last', () => {
    const { weeks } = startupDashboard(
      [
        contract({
          milestones: [milestone({ id: 'm1', status: 'paid' })],
          chainOperations: [operation('m1', 'release', '2026-11-23T00:30:00Z', PAID)],
        }),
      ],
      NOW,
    );
    expect(weeks).toHaveLength(12);
    expect(weeks.at(-1)).toEqual({
      weekStart: '2026-11-23T00:00:00.000Z',
      amount: '2',
    });
    expect(weeks.at(-2)?.amount).toBe('0');
  });

  it('counts only targets already judged', () => {
    const accepted = milestone({
      id: 'm1',
      status: 'paid',
      approvedAt: new Date('2026-11-20'),
      deliverables: [
        delivered('2026-11-19T10:00:00Z', [
          { kpiId: 'k1', value: '120', numericValue: D(120), comment: null },
          { kpiId: 'k2', value: '3', numericValue: D(3), comment: null },
        ]),
      ],
    });
    const { kpis } = startupDashboard(
      [
        contract({
          job: {
            id: 'j1',
            title: 'Leads',
            category: 'growth',
            kpis: [kpi('k1', 100), kpi('k2', 10), kpi('k3', 5)],
          },
          milestones: [accepted],
        }),
      ],
      NOW,
    );
    // k3 has no result yet: it is not a target missed.
    expect(kpis).toEqual({ withTarget: 2, met: 1 });
  });

  it('leaves cancelled contracts out', () => {
    const dashboard = startupDashboard([contract({ status: 'cancelled' })], NOW);
    expect(dashboard.contracts).toEqual({ active: 0, completed: 0 });
    expect(dashboard.specialists).toEqual([]);
  });

  it('adds up by specialist and ranks categories by money', () => {
    const paid = (id: string, amount: string) => ({
      milestones: [milestone({ id, status: 'paid', amount: D(amount) })],
      chainOperations: [
        operation(id, 'release', '2026-11-24T10:00:00Z', [
          { recipient: 'specialist', amount: D(amount) },
        ]),
      ],
    });
    const dashboard = startupDashboard(
      [
        contract({ id: 'c1', ...paid('m1', '1') }),
        contract({
          id: 'c2',
          job: { id: 'j2', title: 'Ventas', category: 'sales', kpis: [] },
          ...paid('m2', '5'),
        }),
      ],
      NOW,
    );
    expect(dashboard.byCategory).toEqual([
      { category: 'sales', spent: '5' },
      { category: 'growth', spent: '1' },
    ]);
    expect(dashboard.specialists).toHaveLength(1);
    expect(dashboard.specialists[0]?.contracts).toBe(2);
  });

  it('lists the next deliveries, the soonest first', () => {
    const { upcoming } = startupDashboard(
      [
        contract({
          milestones: [
            milestone({ id: 'm1', title: 'Late', dueDate: new Date('2026-12-20') }),
            milestone({
              id: 'm2',
              title: 'Soon',
              status: 'changes_requested',
              dueDate: new Date('2026-12-01'),
            }),
            milestone({ id: 'm3', title: 'Delivered', status: 'delivered' }),
          ],
        }),
      ],
      NOW,
    );
    expect(upcoming.map((each) => each.milestoneTitle)).toEqual(['Soon', 'Late']);
  });
});

describe('daysEarly', () => {
  const due = new Date('2026-11-20');
  it('reads a delivery on the day as 0, in any time zone that is still on it', () => {
    expect(daysEarly(due, new Date('2026-11-20T00:01:00Z'))).toBe(0);
    expect(daysEarly(due, new Date('2026-11-20T23:59:00Z'))).toBe(0);
    // Still Nov 20 in Bogotá: on time, so never late.
    expect(daysEarly(due, new Date('2026-11-21T04:00:00Z'))).toBe(0);
  });

  it('counts whole days before, and days after the day was over everywhere', () => {
    expect(daysEarly(due, new Date('2026-11-19T12:00:00Z'))).toBe(1);
    expect(daysEarly(due, new Date('2026-11-17T08:00:00Z'))).toBe(3);
    expect(daysEarly(due, new Date('2026-11-21T13:00:00Z'))).toBe(-1);
    expect(daysEarly(due, new Date('2026-11-22T13:00:00Z'))).toBe(-2);
    expect(daysEarly(due, new Date('2026-11-25T00:00:00Z'))).toBe(-4);
  });
});

describe('delivery times and contracts on the startup dashboard', () => {
  const twoDeliveries = contract({
    id: 'c1',
    createdAt: new Date('2026-10-01'),
    status: 'completed',
    job: { id: 'j1', title: 'Leads', category: 'growth', kpis: [kpi('k1', 100)] },
    milestones: [
      milestone({
        id: 'm1',
        dueDate: new Date('2026-11-10'),
        status: 'paid',
        approvedAt: new Date('2026-11-09'),
        deliverables: [
          delivered('2026-11-08T10:00:00Z', [
            { kpiId: 'k1', value: '120', numericValue: D(120), comment: null },
          ]),
        ],
      }),
      milestone({
        id: 'm2',
        dueDate: new Date('2026-11-12'),
        status: 'paid',
        deliverables: [delivered('2026-11-13T13:00:00Z')],
      }),
    ],
    chainOperations: [operation('m1', 'release', '2026-11-09T10:00:00Z', PAID)],
  });
  const underWay = contract({
    id: 'c2',
    createdAt: new Date('2026-09-01'),
    job: { id: 'j2', title: 'Ads', category: 'paid_media', kpis: [] },
    milestones: [milestone({ id: 'm3' })],
  });

  it('averages how early each first delivery came, late ones below zero', () => {
    const dashboard = startupDashboard([twoDeliveries, underWay], NOW);
    // Two days early and one day late.
    expect(dashboard.delivery).toEqual({ measured: 2, averageDaysEarly: 0.5 });
  });

  it('has no average before anything is delivered', () => {
    expect(startupDashboard([underWay], NOW).delivery).toEqual({
      measured: 0,
      averageDaysEarly: null,
    });
  });

  it('lists each contract with its targets, dates and money, those under way first', () => {
    const dashboard = startupDashboard([twoDeliveries, underWay], NOW);
    expect(dashboard.byContract.map((row) => row.contractId)).toEqual(['c2', 'c1']);
    expect(dashboard.byContract[1]).toEqual({
      contractId: 'c1',
      jobTitle: 'Leads',
      status: 'completed',
      specialist: { id: 'e1', displayName: 'Lucía' },
      kpis: { withTarget: 1, met: 1 },
      milestones: { total: 2, done: 2, onTime: 1, late: 1 },
      delivery: { measured: 2, averageDaysEarly: 0.5 },
      spent: '2',
    });
  });

  it('gives the specialist the same delivery times', () => {
    expect(specialistDashboard([twoDeliveries], NOW).delivery).toEqual({
      measured: 2,
      averageDaysEarly: 0.5,
    });
  });
});

describe('specialistDashboard', () => {
  it('counts what reached them, and what is still to come after fees', () => {
    const dashboard = specialistDashboard(
      [
        contract({
          milestones: [
            milestone({ id: 'm1', status: 'paid' }),
            milestone({ id: 'm2', amount: D(1) }),
          ],
          chainOperations: [operation('m1', 'release', '2026-11-24T10:00:00Z', PAID)],
        }),
      ],
      NOW,
    );
    expect(dashboard.collected).toBe('1.974');
    expect(dashboard.toCollect).toBe('0.987');
    expect(dashboard.weeks.at(-1)?.amount).toBe('1.974');
  });
});

describe('trackRecordOf', () => {
  const finished = (overrides: Record<string, unknown> = {}) =>
    contract({
      status: 'completed',
      completedAt: new Date('2026-11-20'),
      milestones: [
        milestone({
          id: 'm1',
          status: 'paid',
          dueDate: new Date('2026-11-15'),
          deliverables: [delivered('2026-11-10T10:00:00Z')],
        }),
      ],
      ...overrides,
    }) as unknown as TrackRecordSource;

  it('shows the sector and never an amount or a company name', () => {
    const record = trackRecordOf([finished()], NOW);
    expect(record.completed).toBe(1);
    expect(record.jobs[0]).toMatchObject({ sector: 'Café', onTime: true });
    const text = JSON.stringify(record);
    expect(text).not.toContain('Andes');
    expect(text).not.toContain('amount');
  });

  it('counts unfinished contracts for nothing', () => {
    expect(trackRecordOf([finished({ status: 'active' })], NOW).completed).toBe(0);
  });

  it('counts a dispute against them only when it went fully to the startup', () => {
    const disputed = (specialistAmount: number) =>
      finished({
        milestones: [
          milestone({
            id: 'm1',
            status: 'resolved',
            dueDate: new Date('2026-11-15'),
            deliverables: [delivered('2026-11-10T10:00:00Z')],
            disputes: [{ id: 'd1', specialistAmount: D(specialistAmount) }],
          }),
        ],
      });
    expect(trackRecordOf([disputed(1)], NOW).jobs[0]?.onTime).toBe(true);
    expect(trackRecordOf([disputed(0)], NOW).jobs[0]?.onTime).toBe(false);
  });
});

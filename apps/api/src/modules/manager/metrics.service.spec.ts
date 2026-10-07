import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { MetricsController } from './metrics.controller';
import { MetricsService, payoutFeeSql, weeksEndingAt } from './metrics.service';

/** A Thursday, so the current week started on Monday 2026-09-28. */
const NOW = new Date('2026-10-01T12:00:00.000Z');

type Rows = Record<string, unknown[]>;

/** Which query a call is, told apart by a column only that query has. */
const QUERY_MARKERS: [string, string][] = [
  ['weekly', 'UNION ALL'],
  ['users', 'AS new_startups'],
  ['verification', 'FROM verification_requests'],
  ['jobs', 'AS applications_on_posted'],
  ['contracts', 'AS offers_sent'],
  ['milestones', 'AS in_escrow'],
  ['disputes', 'AS to_startups'],
  ['payments', 'FROM chain_operations'],
];

function queryName(strings: TemplateStringsArray): string {
  const sql = strings.join('?');
  const found = QUERY_MARKERS.find(([, marker]) => sql.includes(marker));
  if (!found) throw new Error(`Unexpected query: ${sql}`);
  return found[0];
}

const decimal = (value: string) => new Prisma.Decimal(value);

/** What Postgres would return for a small, realistic month. */
const FULL: Rows = {
  users: [{ startups: 12, new_startups: 3, specialists: 40, new_specialists: 9 }],
  verification: [
    { pending: 4, approved: 7, rejected: 2, median_hours_to_approve: 5.4321 },
  ],
  jobs: [{ posted: 4, open: 6, applications: 13, applications_on_posted: 10 }],
  contracts: [
    {
      offers_sent: 5,
      offers_accepted: 3,
      offers_declined: 1,
      awaiting_reply: 2,
      funded_count: 3,
      funded: decimal('1000.0000001'),
      jobs_completed: 2,
      stale_awaiting_funding: 1,
      median_days_to_first_hire: 2.25,
    },
  ],
  milestones: [
    {
      released: decimal('0.1'),
      pocket_fee: decimal('0.0010001'),
      in_escrow: decimal('750.5'),
      overdue: 2,
    },
  ],
  disputes: [
    {
      open: 1,
      resolved: 2,
      to_specialists: decimal('0.2'),
      to_startups: decimal('99.9999999'),
      pocket_fee: decimal('0.0000002'),
    },
  ],
  payments: [{ payments: 4, sent: decimal('120.0000005') }],
  weekly: [],
};

/** An empty platform: sums are 0, medians have nothing to measure. */
const EMPTY: Rows = {
  users: [{ startups: 0, new_startups: 0, specialists: 0, new_specialists: 0 }],
  verification: [{ pending: 0, approved: 0, rejected: 0, median_hours_to_approve: null }],
  jobs: [{ posted: 0, open: 0, applications: 0, applications_on_posted: 0 }],
  contracts: [
    {
      offers_sent: 0,
      offers_accepted: 0,
      offers_declined: 0,
      awaiting_reply: 0,
      funded_count: 0,
      funded: decimal('0'),
      jobs_completed: 0,
      stale_awaiting_funding: 0,
      median_days_to_first_hire: null,
    },
  ],
  milestones: [
    {
      released: decimal('0'),
      pocket_fee: decimal('0'),
      in_escrow: decimal('0'),
      overdue: 0,
    },
  ],
  disputes: [
    {
      open: 0,
      resolved: 0,
      to_specialists: decimal('0'),
      to_startups: decimal('0'),
      pocket_fee: decimal('0'),
    },
  ],
  payments: [{ payments: 0, sent: decimal('0') }],
  weekly: [],
};

describe('MetricsService', () => {
  let queryRaw: jest.Mock<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>;
  let service: MetricsService;
  let rows: Rows;

  beforeEach(() => {
    rows = FULL;
    queryRaw = jest.fn((strings: TemplateStringsArray) =>
      Promise.resolve(rows[queryName(strings)]),
    );
    service = new MetricsService({ $queryRaw: queryRaw } as unknown as PrismaService);
  });

  /** The values bound to the named query, in order. */
  function valuesOf(name: string): unknown[] {
    return callOf(name).slice(1);
  }

  function callOf(name: string): [TemplateStringsArray, ...unknown[]] {
    const call = queryRaw.mock.calls.find(([strings]) => queryName(strings) === name);
    if (!call) throw new Error(`${name} query not run`);
    return call;
  }

  /**
   * The named query as Postgres would run it, with ? where values
   * are bound. Fragments built with Prisma.sql are expanded the same way.
   */
  function sqlOf(name: string): string {
    const [strings, ...values] = callOf(name);
    return Prisma.sql(strings, ...values).sql;
  }

  it('reads every table once, in eight queries', async () => {
    await service.metrics('30d', NOW);
    expect(queryRaw).toHaveBeenCalledTimes(8);
    const names = queryRaw.mock.calls.map(([strings]) => queryName(strings));
    expect(new Set(names).size).toBe(8);
  });

  it('binds every input as a parameter, never in the SQL text', async () => {
    await service.metrics('7d', NOW);
    for (const [strings] of queryRaw.mock.calls) {
      const sql = strings.join('');
      expect(sql).not.toContain('2026-');
    }
  });

  it('maps users, verification and marketplace counts', async () => {
    const result = await service.metrics('30d', NOW);

    expect(result.users).toEqual({
      startups: { total: 12, newInPeriod: 3 },
      specialists: { total: 40, newInPeriod: 9 },
      verification: { pending: 4, approved: 7, rejected: 2, medianHoursToApprove: 5.4 },
    });
    expect(result.marketplace).toEqual({
      jobsPosted: 4,
      openJobs: 6,
      applications: 13,
      // 10 applications on the 4 jobs posted in the period.
      averageApplicationsPerJob: 2.5,
      jobsCompleted: 2,
      offers: { sent: 5, accepted: 3, declined: 1, withdrawn: null, awaitingReply: 2 },
      medianDaysToFirstHire: 2.3,
    });
    expect(result.health).toEqual({
      openDisputes: 1,
      disputesResolved: 2,
      overdueMilestones: 2,
      staleAwaitingFunding: 1,
    });
  });

  it('keeps money exact as decimal strings', async () => {
    const { money } = await service.metrics('30d', NOW);

    expect(money).toEqual({
      funded: '1000.0000001',
      contractsFunded: 3,
      // 1000.0000001 / 3, kept to USDC's 7 decimals.
      averageContract: '333.3333334',
      // 0.1 released plus 0.2 from a dispute: exactly 0.3, not 0.30000000000000004.
      released: '0.3',
      refunded: '99.9999999',
      inEscrow: '750.5',
      // Milestone fees plus dispute fees, added exactly.
      pocketFee: '0.0010003',
      walletPayments: '120.0000005',
      walletPaymentCount: 4,
    });
    for (const value of Object.values(money)) {
      if (typeof value !== 'number') expect(typeof value).toBe('string');
    }
  });

  describe('Pocket fee', () => {
    const MILESTONE_FEE = 'trunc(COALESCE(m.amount, 0) * c.platform_fee_bps * 0.0001, 7)';
    const fee = (column: string) =>
      `trunc(COALESCE(${column}, 0) * c.platform_fee_bps * 0.0001, 7)`;

    it("charges each payout its own contract's fee, rounded down to the stroop", () => {
      // Basis points times 0.0001 is exact numeric math, and trunc to 7
      // decimals drops anything below a stroop instead of rounding it up.
      expect(payoutFeeSql(Prisma.sql`m.amount`).sql).toBe(MILESTONE_FEE);
    });

    it('sums the fee payout by payout over the paid milestones of the period', async () => {
      await service.metrics('30d', NOW);
      const sql = sqlOf('milestones');
      // Rounded inside the SUM, so per payout, not once on the total.
      expect(sql).toContain(
        `SUM(${MILESTONE_FEE}) FILTER (\n              WHERE m.status = 'paid' AND m.paid_at >= ?::timestamp`,
      );
      expect(sql).toContain('JOIN contracts c ON c.id = m.contract_id');
    });

    it("charges both sides of a resolved dispute, each at its contract's fee", async () => {
      await service.metrics('30d', NOW);
      const sql = sqlOf('disputes');
      expect(sql).toContain(
        `SUM((${fee('d.specialist_amount')} + ${fee('d.startup_amount')})) FILTER (`,
      );
      expect(sql).toContain('JOIN milestones m ON m.id = d.milestone_id');
      expect(sql).toContain('JOIN contracts c ON c.id = m.contract_id');
    });

    it('adds milestone and dispute fees exactly, as contracts at 0 and at 1% report them', async () => {
      // A contract from before the fee (0 bps) adds nothing; one at 100 bps
      // adds its 1%. Postgres sums per payout; the service adds both sums.
      rows = {
        ...EMPTY,
        milestones: [
          {
            released: decimal('1500'),
            pocket_fee: decimal('5'),
            in_escrow: decimal('0'),
            overdue: 0,
          },
        ],
        disputes: [
          {
            open: 0,
            resolved: 1,
            to_specialists: decimal('60'),
            to_startups: decimal('40'),
            // 1% of 60 plus 1% of 40.
            pocket_fee: decimal('1'),
          },
        ],
      };
      const { money } = await service.metrics('30d', NOW);
      expect(money.released).toBe('1560');
      expect(money.pocketFee).toBe('6');
    });
  });

  it('counts jobs completed in the period, one contract per job', async () => {
    await service.metrics('7d', NOW);
    expect(sqlOf('contracts')).toContain(
      "WHERE status = 'completed' AND completed_at >= ?::timestamp\n            )::int AS jobs_completed",
    );
  });

  it('counts confirmed payments sent from Pocket wallets in the period', async () => {
    const { money } = await service.metrics('7d', NOW);
    expect(sqlOf('payments')).toContain(
      "WHERE kind = 'payment' AND status = 'confirmed'\n            AND confirmed_at >= ?::timestamp",
    );
    expect(valuesOf('payments')).toEqual(['2026-09-24T12:00:00.000Z']);
    expect(money.walletPayments).toBe('120.0000005');
    expect(money.walletPaymentCount).toBe(4);
  });

  it('answers an empty platform with zeros and no medians', async () => {
    rows = EMPTY;
    const result = await service.metrics('30d', NOW);

    expect(result.users.verification.medianHoursToApprove).toBeNull();
    expect(result.marketplace.averageApplicationsPerJob).toBeNull();
    expect(result.marketplace.medianDaysToFirstHire).toBeNull();
    expect(result.money).toEqual({
      funded: '0',
      contractsFunded: 0,
      averageContract: null,
      released: '0',
      refunded: '0',
      inEscrow: '0',
      pocketFee: '0',
      walletPayments: '0',
      walletPaymentCount: 0,
    });
    expect(result.marketplace.jobsCompleted).toBe(0);
    expect(result.weekly).toHaveLength(12);
  });

  it('counts BigInt columns as plain numbers', async () => {
    rows = {
      ...EMPTY,
      users: [{ startups: 5n, new_startups: 1n, specialists: 2n, new_specialists: 0n }],
    };
    const result = await service.metrics('30d', NOW);
    expect(result.users.startups).toEqual({ total: 5, newInPeriod: 1 });
  });

  describe('period', () => {
    it.each([
      ['7d', '2026-09-24T12:00:00.000Z'],
      ['30d', '2026-09-01T12:00:00.000Z'],
      ['90d', '2026-07-03T12:00:00.000Z'],
    ] as const)('%s starts the window at %s', async (period, since) => {
      const result = await service.metrics(period, NOW);

      expect(result.period).toBe(period);
      expect(result.since).toBe(since);
      for (const name of ['users', 'verification', 'jobs', 'disputes', 'payments']) {
        expect(valuesOf(name)).toContain(since);
      }
      expect(valuesOf('contracts')).toContain(since);
      expect(valuesOf('milestones')).toContain(since);
    });

    it('defaults to the last 30 days', async () => {
      const result = await service.metrics(undefined, NOW);
      expect(result.period).toBe('30d');
      expect(result.since).toBe('2026-09-01T12:00:00.000Z');
    });

    it('all time has no start and counts from the epoch', async () => {
      const result = await service.metrics('all', NOW);
      expect(result.since).toBeNull();
      expect(valuesOf('users')).toContain('1970-01-01T00:00:00.000Z');
    });

    it('measures overdue milestones against today and stale funding against 3 days ago', async () => {
      await service.metrics('7d', NOW);
      expect(valuesOf('milestones')).toContain('2026-10-01');
      expect(valuesOf('contracts')).toContain('2026-09-28T12:00:00.000Z');
    });

    it('the weekly series ignores the period', async () => {
      await service.metrics('7d', NOW);
      const dates = valuesOf('weekly').filter((value) => typeof value === 'string');
      expect(dates).toEqual(Array(9).fill('2026-07-13T00:00:00.000Z'));
    });
  });

  describe('weekly series', () => {
    it('has the last 12 weeks, starting on Monday UTC, current week last', () => {
      const weeks = weeksEndingAt(NOW).map((week) => week.toISOString());
      expect(weeks).toHaveLength(12);
      expect(weeks[0]).toBe('2026-07-13T00:00:00.000Z');
      expect(weeks[11]).toBe('2026-09-28T00:00:00.000Z');
      // A Monday is the start of its own week, and Sunday still belongs to the one before.
      expect(weeksEndingAt(new Date('2026-09-28T00:00:00Z'))[11].toISOString()).toBe(
        '2026-09-28T00:00:00.000Z',
      );
      expect(weeksEndingAt(new Date('2026-09-27T23:59:59Z'))[11].toISOString()).toBe(
        '2026-09-21T00:00:00.000Z',
      );
    });

    it('computes the new weekly series the same way as the period numbers', async () => {
      await service.metrics('30d', NOW);
      const sql = sqlOf('weekly');
      expect(sql).toContain(
        "SELECT 'completed', date_trunc('week', completed_at), COUNT(*)::int, NULL\n          FROM contracts\n          WHERE status = 'completed'",
      );
      expect(sql).toContain("WHERE kind = 'payment' AND status = 'confirmed'");
      expect(sql).toContain(
        "SELECT 'fee', date_trunc('week', m.paid_at), COUNT(*)::int, SUM(trunc(COALESCE(m.amount, 0) * c.platform_fee_bps * 0.0001, 7))",
      );
      expect(sql).toContain(
        "SELECT 'fee', date_trunc('week', d.resolved_at), COUNT(*)::int, SUM((trunc(COALESCE(d.specialist_amount, 0) * c.platform_fee_bps * 0.0001, 7) + trunc(COALESCE(d.startup_amount, 0) * c.platform_fee_bps * 0.0001, 7)))",
      );
    });

    it('fills each week, sums both kinds of release and leaves gaps at zero', async () => {
      const week = (iso: string) => new Date(iso);
      rows = {
        ...EMPTY,
        weekly: [
          { series: 'users', week: week('2026-09-28T00:00:00Z'), count: 3, amount: null },
          { series: 'jobs', week: week('2026-09-28T00:00:00Z'), count: 2n, amount: null },
          {
            series: 'funded',
            week: week('2026-09-21T00:00:00Z'),
            count: 1,
            amount: decimal('500.25'),
          },
          {
            series: 'released',
            week: week('2026-09-21T00:00:00Z'),
            count: 1,
            amount: decimal('0.1'),
          },
          {
            series: 'released',
            week: week('2026-09-21T00:00:00Z'),
            count: 1,
            amount: decimal('0.2'),
          },
          {
            series: 'completed',
            week: week('2026-09-28T00:00:00Z'),
            count: 1,
            amount: null,
          },
          {
            series: 'payments',
            week: week('2026-09-28T00:00:00Z'),
            count: 2,
            amount: decimal('25.5'),
          },
          // Paid milestones and resolved disputes of the same week add up.
          {
            series: 'fee',
            week: week('2026-09-21T00:00:00Z'),
            count: 1,
            amount: decimal('0.0000001'),
          },
          {
            series: 'fee',
            week: week('2026-09-21T00:00:00Z'),
            count: 1,
            amount: decimal('0.0000002'),
          },
          // Outside the 12 weeks: ignored.
          {
            series: 'users',
            week: week('2026-07-06T00:00:00Z'),
            count: 99,
            amount: null,
          },
        ],
      };

      const { weekly } = await service.metrics('30d', NOW);

      expect(weekly).toHaveLength(12);
      expect(weekly[11]).toEqual({
        weekStart: '2026-09-28T00:00:00.000Z',
        newUsers: 3,
        jobsPosted: 2,
        jobsCompleted: 1,
        funded: '0',
        released: '0',
        walletPayments: '25.5',
        pocketFee: '0',
      });
      expect(weekly[10]).toEqual({
        weekStart: '2026-09-21T00:00:00.000Z',
        newUsers: 0,
        jobsPosted: 0,
        jobsCompleted: 0,
        funded: '500.25',
        released: '0.3',
        walletPayments: '0',
        pocketFee: '0.0000003',
      });
      expect(weekly.reduce((sum, w) => sum + w.newUsers, 0)).toBe(3);
    });
  });
});

describe('MetricsController', () => {
  it('is served at /manager/metrics to managers only', () => {
    expect(Reflect.getMetadata(PATH_METADATA, MetricsController)).toBe('manager/metrics');
    expect(Reflect.getMetadata(ROLES_KEY, MetricsController)).toEqual(['manager']);
  });

  it('the roles guard turns away startups and specialists', () => {
    const guard = new RolesGuard(new Reflector());
    const contextFor = (role: string) =>
      ({
        getHandler: () => MetricsController.prototype.get,
        getClass: () => MetricsController,
        switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u', role } }) }),
      }) as unknown as ExecutionContext;

    expect(guard.canActivate(contextFor('manager'))).toBe(true);
    expect(() => guard.canActivate(contextFor('startup'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor('specialist'))).toThrow(ForbiddenException);
  });

  it('passes the period through to the service', async () => {
    const metrics = { metrics: jest.fn().mockResolvedValue({}) };
    const controller = new MetricsController(metrics as unknown as MetricsService);
    await controller.get({ period: '90d' });
    expect(metrics.metrics).toHaveBeenCalledWith('90d');
  });

  it.each([
    [{}, 0],
    [{ period: '7d' }, 0],
    [{ period: 'all' }, 0],
    [{ period: '365d' }, 1],
    [{ period: "30d' OR 1=1" }, 1],
  ])('validates the period query %j', async (query, errors) => {
    const dto = plainToInstance(MetricsQueryDto, query);
    expect(await validate(dto)).toHaveLength(errors);
  });
});

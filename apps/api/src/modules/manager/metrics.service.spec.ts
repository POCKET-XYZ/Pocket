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
import { MetricsService, pocketFeeOf, weeksEndingAt } from './metrics.service';

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
      stale_awaiting_funding: 1,
      median_days_to_first_hire: 2.25,
    },
  ],
  milestones: [{ released: decimal('0.1'), in_escrow: decimal('750.5'), overdue: 2 }],
  disputes: [
    {
      open: 1,
      resolved: 2,
      to_specialists: decimal('0.2'),
      to_startups: decimal('99.9999999'),
    },
  ],
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
      stale_awaiting_funding: 0,
      median_days_to_first_hire: null,
    },
  ],
  milestones: [{ released: decimal('0'), in_escrow: decimal('0'), overdue: 0 }],
  disputes: [
    { open: 0, resolved: 0, to_specialists: decimal('0'), to_startups: decimal('0') },
  ],
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
    const call = queryRaw.mock.calls.find(([strings]) => queryName(strings) === name);
    if (!call) throw new Error(`${name} query not run`);
    return call.slice(1);
  }

  it('reads every table once, in seven queries', async () => {
    await service.metrics('30d', NOW);
    expect(queryRaw).toHaveBeenCalledTimes(7);
    const names = queryRaw.mock.calls.map(([strings]) => queryName(strings));
    expect(new Set(names).size).toBe(7);
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
      pocketFee: '0.003',
    });
    for (const value of Object.values(money)) {
      if (typeof value !== 'number') expect(typeof value).toBe('string');
    }
  });

  it('charges the Pocket fee at 1% and never rounds it up', () => {
    expect(pocketFeeOf(decimal('1000'))).toBe('10');
    expect(pocketFeeOf(decimal('1234.5678901'))).toBe('12.3456789');
    // 1% of 0.0000099 is 0.000000099, below one stroop.
    expect(pocketFeeOf(decimal('0.0000099'))).toBe('0');
    expect(pocketFeeOf(decimal('0'))).toBe('0');
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
    });
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
      for (const name of ['users', 'verification', 'jobs', 'disputes']) {
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
      expect(valuesOf('weekly')).toEqual(Array(5).fill('2026-07-13T00:00:00.000Z'));
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
        funded: '0',
        released: '0',
      });
      expect(weekly[10]).toEqual({
        weekStart: '2026-09-21T00:00:00.000Z',
        newUsers: 0,
        jobsPosted: 0,
        funded: '500.25',
        released: '0.3',
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

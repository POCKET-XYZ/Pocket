import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { AssistantAdminService } from './assistant-admin.service';
import type { AssistantModel } from './model.client';
import { summarize, type UsageRow } from './usage';

const row = (over: Partial<UsageRow>): UsageRow => ({
  userId: 'u-1',
  kind: 'job_draft',
  status: 'shown',
  failureReason: null,
  costUsd: 0.0007,
  latencyMs: 8000,
  promptVersion: 'job_draft@1',
  countsTowardLimit: true,
  askedQuestions: false,
  outcome: 'resolved',
  fieldOutcomes: null,
  ...over,
});

const CONTEXT = { month: '2026-11', enabled: true, model: 'claude-haiku-5-5', budgetUsd: 20 };

describe('summarize', () => {
  const rows: UsageRow[] = [
    row({ fieldOutcomes: { title: 'accepted', description: 'edited', 'milestone:0': 'accepted', 'milestone:1': 'discarded' } }),
    row({ userId: 'u-2', promptVersion: 'job_draft@2', fieldOutcomes: { title: 'edited', 'kpi:0': 'accepted' } }),
    row({ userId: 'u-3', outcome: 'no_outcome' }),
    row({ userId: 'u-3', outcome: null }),
    row({ kind: 'delivery_report', promptVersion: 'delivery_report@2', fieldOutcomes: { note: 'accepted', 'kpi:0': 'accepted' } }),
    row({ askedQuestions: true, countsTowardLimit: false, outcome: null, costUsd: 0.0001 }),
    row({ status: 'failed', failureReason: 'refusal', costUsd: 0.0003, outcome: null }),
    row({ status: 'rejected_precheck', failureReason: 'daily', costUsd: 0, outcome: null }),
    row({ status: 'rejected_precheck', failureReason: 'daily', costUsd: 0, outcome: null }),
  ];
  const usage = summarize(rows, CONTEXT);

  it('adds up the real spend against the budget', () => {
    expect(usage.spend.usd).toBeCloseTo(0.0007 * 5 + 0.0001 + 0.0003, 6);
    expect(usage.spend.share).toBeCloseTo(usage.spend.usd / 20, 4);
  });

  it('counts what was shown, failed and refused, by kind', () => {
    expect(usage.suggestions.job_draft).toEqual({ shown: 5, failed: 1, refused: 2 });
    expect(usage.suggestions.delivery_report).toEqual({ shown: 1, failed: 0, refused: 0 });
    expect(usage.questions).toBe(1);
    expect(usage.people).toBe(3);
  });

  it('keeps suggestions that led nowhere apart from discarded parts', () => {
    expect(usage.outcomes).toEqual({ resolved: 3, noOutcome: 1, waiting: 1 });
    expect(usage.parts.discarded).toBe(1);
  });

  it('counts accepted, edited and discarded parts, by part and by version', () => {
    expect(usage.parts).toEqual(
      expect.objectContaining({ accepted: 5, edited: 2, discarded: 1 }),
    );
    expect(usage.parts.byPart).toEqual(
      expect.arrayContaining([
        { part: 'title', accepted: 1, edited: 1, discarded: 0 },
        { part: 'milestone', accepted: 1, edited: 0, discarded: 1 },
        { part: 'kpi', accepted: 2, edited: 0, discarded: 0 },
        { part: 'note', accepted: 1, edited: 0, discarded: 0 },
      ]),
    );
    expect(usage.byVersion).toEqual(
      expect.arrayContaining([
        { version: 'job_draft@1', suggestions: 3, accepted: 2, edited: 1, discarded: 1 },
        { version: 'job_draft@2', suggestions: 1, accepted: 1, edited: 1, discarded: 0 },
      ]),
    );
  });

  it('lists failures and refusals by reason, the most first', () => {
    expect(usage.failures).toEqual([
      { reason: 'daily', count: 2 },
      { reason: 'refusal', count: 1 },
    ]);
  });
});

describe('AssistantAdminService.sweep', () => {
  it('marks a week-old suggestion that led nowhere, and clears texts older than a year', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = { assistantSuggestion: { updateMany } } as unknown as PrismaService;
    const config = { get: () => undefined } as unknown as ConfigService;
    const admin = new AssistantAdminService(prisma, { usable: true, model: 'm' } as AssistantModel, config);
    const now = new Date('2026-11-20T00:00:00Z');
    await admin.sweep(now);
    type Call = { where: Record<string, unknown> & { createdAt: unknown }; data: Record<string, unknown> };
    const [stale, old] = (updateMany.mock.calls as Array<[Call]>).map(([args]) => args);
    expect(stale.where).toEqual(
      expect.objectContaining({ status: 'shown', askedQuestions: false, outcome: null, createdAt: { lt: new Date('2026-11-13T00:00:00Z') } }),
    );
    expect(stale.data).toEqual({ outcome: 'no_outcome' });
    expect(old.where.createdAt).toEqual({ lt: new Date('2025-11-20T00:00:00Z') });
    expect(old.data.inputText).toBeNull();
  });

  it('refuses a month that is not AAAA-MM', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const admin = new AssistantAdminService({} as PrismaService, { usable: true, model: 'm' } as AssistantModel, config);
    await expect(admin.usage('noviembre')).rejects.toThrow('El mes va como AAAA-MM');
  });
});

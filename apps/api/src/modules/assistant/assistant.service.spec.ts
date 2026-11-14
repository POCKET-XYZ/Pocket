import { HttpException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as securityLog from '../../common/security/security-log';
import type { PrismaService } from '../../prisma/prisma.service';
import { AssistantService, completedParts, type AssistantEvent } from './assistant.service';
import type { RawJobDraft } from './job-draft/schema';
import type { AssistantModel, ModelResult } from './model.client';

const USER = { sub: 'startup-1', role: 'startup' as const, stellarAddress: 'G...' };
const USAGE = { inputTokens: 200, outputTokens: 900, cacheReadTokens: 1800, cacheWriteTokens: 0 };

const DRAFT: RawJobDraft = {
  mode: 'draft',
  language: 'es',
  questions: [],
  title: 'Tres videos cortos para TikTok sobre la app',
  description:
    'Queremos explicar cómo funciona la app de ahorro en grupo con videos cortos, claros y cercanos para TikTok.',
  deliverables: 'Tres videos verticales editados y publicados',
  milestones: [
    {
      title: 'Guion de los videos',
      description: 'El guion de los tres videos para revisarlo',
      acceptance_criteria: ['Un documento con los tres guiones'],
      weight: 1,
    },
    {
      title: 'Los tres videos',
      description: 'Los tres videos editados y publicados',
      acceptance_criteria: ['Formato vertical con subtítulos'],
      weight: 2,
    },
  ],
  kpis: [],
  warnings: [],
};

const ok = (json: unknown): ModelResult => ({ ok: true, json, usage: USAGE, latencyMs: 4000 });

describe('AssistantService', () => {
  let prisma: {
    user: { findUnique: jest.Mock };
    kpiTemplate: { findMany: jest.Mock };
    milestone: { findUnique: jest.Mock };
    assistantSuggestion: {
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let model: { usable: boolean; model: string; generate: jest.Mock };
  let events: AssistantEvent[];
  let alert: jest.SpyInstance;
  const emit = (event: AssistantEvent) => events.push(event);

  function service(settings: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = {
      'assistant.enabled': true,
      'assistant.dailyLimit': 20,
      'assistant.monthlyBudgetUsd': 20,
      ...settings,
    };
    const config = { get: (key: string) => values[key] } as unknown as ConfigService;
    return new AssistantService(
      prisma as unknown as PrismaService,
      model as unknown as AssistantModel,
      config,
    );
  }

  /** The counts the checks read: requests in the last minute, then today's suggestions. */
  function counts(lastMinute: number, today: number) {
    prisma.assistantSuggestion.count.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve('countsTowardLimit' in where ? today : lastMinute),
    );
  }

  beforeEach(() => {
    events = [];
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: 'startup',
          verificationStatus: 'approved',
          deletedAt: null,
        }),
      },
      kpiTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      milestone: { findUnique: jest.fn() },
      assistantSuggestion: {
        create: jest.fn().mockResolvedValue({ id: 'sug-1' }),
        update: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: 1 } }),
        findUnique: jest.fn(),
      },
    };
    counts(0, 0);
    model = { usable: true, model: 'claude-haiku-5-5', generate: jest.fn().mockResolvedValue(ok(DRAFT)) };
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    alert = jest.spyOn(securityLog, 'securityEvent').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const ask = (text = 'Necesito tres videos para TikTok, tengo 300 USDC') =>
    service().jobDraft(USER, { text }, emit);

  async function refusedWith(run: Promise<void>, status: number, reason: string) {
    await expect(run).rejects.toBeInstanceOf(HttpException);
    await run.catch((error: HttpException) => {
      expect(error.getStatus()).toBe(status);
      expect(error.getResponse()).toEqual(expect.objectContaining({ reason }));
    });
    expect(model.generate).not.toHaveBeenCalled();
    expect(prisma.assistantSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'rejected_precheck', failureReason: reason }),
    });
  }

  it('drafts, records real tokens and cost, and counts the suggestion', async () => {
    await ask();
    const done = events.find((event) => event.type === 'done');
    expect(done).toEqual(
      expect.objectContaining({
        suggestionId: 'sug-1',
        draft: expect.objectContaining({ budget: 300 }),
      }),
    );
    expect(prisma.assistantSuggestion.update).toHaveBeenCalledWith({
      where: { id: 'sug-1' },
      data: expect.objectContaining({
        status: 'shown',
        countsTowardLimit: true,
        inputTokens: 200,
        outputTokens: 900,
        cacheReadTokens: 1800,
        // 200 x 0.10 + 900 x 0.50 + 1800 x 0.01, per million.
        costUsd: 0.000488,
        attempts: 1,
      }),
    });
  });

  it('holds the highest possible cost against the budget while the call runs', async () => {
    await ask();
    expect(prisma.assistantSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'failed', failureReason: 'in_progress', costUsd: expect.any(Number) }),
    });
    const held = prisma.assistantSuggestion.create.mock.calls[0][0].data.costUsd as number;
    expect(held).toBeGreaterThan(0.004);
  });

  it('is off for everyone when ASSISTANT_ENABLED is not true', async () => {
    await refusedWith(service({ 'assistant.enabled': false }).jobDraft(USER, { text: 'Tres videos' }, emit), 503, 'disabled');
  });

  it('tells the screen it is off for everyone, so the panel hides', async () => {
    const quota = await service({ 'assistant.enabled': false }).quota(USER);
    expect(quota).toEqual(expect.objectContaining({ available: false, reason: 'off' }));
  });

  it('tells a person why it is not for them yet', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'startup', verificationStatus: 'pending', deletedAt: null });
    expect(await service().quota(USER)).toEqual(
      expect.objectContaining({ available: false, reason: 'not_verified' }),
    );
  });

  it('is off without a key or a known price', async () => {
    model.usable = false;
    await refusedWith(ask(), 503, 'disabled');
  });

  it('refuses an account that is not verified, without asking the model', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'startup', verificationStatus: 'pending', deletedAt: null });
    await refusedWith(ask(), 403, 'not_verified');
  });

  it('refuses a sixth request in a minute', async () => {
    counts(5, 0);
    await refusedWith(ask(), 429, 'per_minute');
  });

  it('refuses the 21st suggestion of the day, saying when more come', async () => {
    counts(0, 20);
    const run = ask();
    await refusedWith(run, 429, 'daily');
    await run.catch((error: HttpException) =>
      expect((error.getResponse() as { message: string }).message).toMatch(/Tendrás más en \d+ (hora|horas|minuto|minutos)/),
    );
  });

  it('counts the day from midnight UTC', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-14T23:30:00Z') });
    try {
      await ask();
      const where = prisma.assistantSuggestion.count.mock.calls
        .map(([args]: [{ where: Record<string, unknown> }]) => args.where)
        .find((args) => 'countsTowardLimit' in args) as { createdAt: { gte: Date } };
      expect(where.createdAt.gte.toISOString()).toBe('2026-11-14T00:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses everyone once the month's budget is spent, and tells the team", async () => {
    prisma.assistantSuggestion.aggregate.mockResolvedValue({ _sum: { costUsd: 20 } });
    await refusedWith(ask(), 503, 'monthly_budget');
    expect(alert).toHaveBeenCalledWith(
      'assistant_budget',
      expect.objectContaining({ state: 'off until next month' }),
      'alert',
    );
  });

  it('tells the team once when the month passes 80% of the budget', async () => {
    prisma.assistantSuggestion.aggregate.mockResolvedValue({ _sum: { costUsd: 16.5 } });
    const assistant = service();
    await assistant.jobDraft(USER, { text: 'Tres videos para TikTok' }, emit);
    await assistant.jobDraft(USER, { text: 'Tres videos para TikTok' }, emit);
    const budgetAlerts = alert.mock.calls.filter(([name]) => name === 'assistant_budget');
    expect(budgetAlerts).toHaveLength(1);
    expect(budgetAlerts[0][1]).toEqual(expect.objectContaining({ state: '80% used' }));
  });

  it.each([['refusal'], ['truncated'], ['timeout'], ['api_error']] as const)(
    'records a %s as failed, not counted, with what it cost',
    async (reason) => {
      model.generate.mockResolvedValue({ ok: false, reason, usage: USAGE, latencyMs: 30000 });
      await ask();
      expect(prisma.assistantSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sug-1' },
        data: expect.objectContaining({ status: 'failed', failureReason: reason, costUsd: 0.000488 }),
      });
      expect(prisma.assistantSuggestion.update.mock.calls[0][0].data.countsTowardLimit).toBeUndefined();
      expect(events.at(-1)).toEqual({
        type: 'error',
        message: 'No pudimos armar la sugerencia. Intenta con otras palabras.',
      });
    },
  );

  it('asks again once when a part breaks a rule, and adds up both calls', async () => {
    const bad = { ...DRAFT, title: 'Videos que garantizan 10 mil seguidores' };
    model.generate.mockResolvedValueOnce(ok(bad)).mockResolvedValueOnce(ok(DRAFT));
    await ask();
    expect(model.generate).toHaveBeenCalledTimes(2);
    const data = prisma.assistantSuggestion.update.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ attempts: 2, costUsd: 0.000976, outputTokens: 1800 }));
    const done = events.find((event) => event.type === 'done') as Extract<AssistantEvent, { type: 'done' }>;
    expect(done.draft.title).toBe(DRAFT.title);
  });

  it('shows questions back without counting them, once', async () => {
    model.generate.mockResolvedValue(ok({ ...DRAFT, mode: 'questions', questions: ['¿Qué quieres que se entregue?'] }));
    await service().jobDraft(USER, { text: 'Ayúdame con marketing' }, emit);
    expect(events.at(-1)).toEqual({
      type: 'questions',
      suggestionId: 'sug-1',
      questions: ['¿Qué quieres que se entregue?'],
    });
    expect(prisma.assistantSuggestion.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ status: 'shown', askedQuestions: true, countsTowardLimit: false }),
    );
  });

  it('drafts after the answers even when the model asks again', async () => {
    model.generate
      .mockResolvedValueOnce(ok({ ...DRAFT, mode: 'questions', questions: ['¿Y el canal?'] }))
      .mockResolvedValueOnce(ok(DRAFT));
    await service().jobDraft(
      USER,
      { text: 'Ayúdame con marketing', followUp: { questions: ['¿Qué se entrega?'], answers: 'Tres videos' } },
      emit,
    );
    expect(events.find((event) => event.type === 'done')).toBeDefined();
  });

  it('never sends the model an email or a phone the company pasted', async () => {
    await ask('Tres videos para TikTok, escríbeme a ana@gmail.com o al 71234567');
    const sent = model.generate.mock.calls[0][0].user as string;
    expect(sent).not.toMatch(/ana@gmail|71234567/);
    expect(sent).toContain('[correo]');
  });

  describe('deliveryReport', () => {
    const EXPERT = { sub: 'expert-1', role: 'specialist' as const, stellarAddress: 'G...' };
    const NOTES = 'Subí los 3 videos. El primero llegó a 12 mil vistas y hubo 340 clics al link.';
    const MILESTONE = {
      title: 'Videos',
      description: 'Los tres videos publicados',
      acceptanceCriteria: '- Tres videos verticales',
      status: 'pending',
      contract: {
        specialistId: 'expert-1',
        status: 'active',
        job: {
          kpis: [
            { id: 'k-views', name: 'Vistas', unit: 'vistas' },
            { id: 'k-installs', name: 'Instalaciones', unit: null },
          ],
        },
      },
    };
    const report = (dto = { milestoneId: 'ms-1', notes: NOTES }) =>
      service().deliveryReport(EXPERT, dto, emit);

    beforeEach(() => {
      prisma.milestone.findUnique.mockResolvedValue(MILESTONE);
      prisma.user.findUnique.mockResolvedValue({ role: 'specialist', verificationStatus: 'approved', deletedAt: null });
      model.generate.mockResolvedValue(
        ok({
          language: 'es',
          note: 'Publiqué los 3 videos: el primero llegó a 12 mil vistas.',
          kpi_values: [
            { kpi_id: 'k-views', value: 12000 },
            { kpi_id: 'k-installs', value: 40 },
          ],
        }),
      );
    });

    it('reads each KPI from the notes, and leaves empty what they do not give', async () => {
      await report();
      const done = events.at(-1) as Extract<AssistantEvent, { type: 'report' }>;
      expect(done.type).toBe('report');
      expect(done.report.kpis.map((kpi) => kpi.value)).toEqual([12000, null]);
      expect(done.report.kpis[1].warning).toBe('No encontré este dato en tus notas.');
      expect(prisma.assistantSuggestion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'delivery_report', milestoneId: 'ms-1' }),
      });
    });

    it("answers someone else's milestone as if it did not exist, without a row", async () => {
      prisma.milestone.findUnique.mockResolvedValue({
        ...MILESTONE,
        contract: { ...MILESTONE.contract, specialistId: 'expert-2' },
      });
      await expect(report()).rejects.toThrow('No encontramos ese hito');
      expect(prisma.assistantSuggestion.create).not.toHaveBeenCalled();
      expect(model.generate).not.toHaveBeenCalled();
    });

    it('refuses a milestone that is not waiting for its delivery', async () => {
      prisma.milestone.findUnique.mockResolvedValue({ ...MILESTONE, status: 'approved' });
      await expect(report()).rejects.toThrow('Este hito no está esperando una entrega');
      expect(model.generate).not.toHaveBeenCalled();
    });

    it('is for experts: a startup account is refused before the model', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: 'startup', verificationStatus: 'approved', deletedAt: null });
      await refusedWith(report(), 403, 'not_verified');
    });
  });

  describe('outcome', () => {
    beforeEach(() => {
      prisma.assistantSuggestion.findUnique.mockResolvedValue({
        id: 'sug-1',
        userId: 'startup-1',
        outputJson: {
          title: 'Tres videos cortos para TikTok',
          description: 'Una descripción larga del trabajo que se necesita hacer',
          deliverables: 'Tres videos',
          milestones: [{ title: 'Guion', description: 'El guion', acceptanceCriteria: '- Un guion', amount: 100 }],
          kpis: [],
          warnings: [],
          budget: 100,
        },
      });
    });

    it('compares each part with what was shown: accepted, edited or discarded', async () => {
      await service().outcome(USER, 'sug-1', {
        parts: [
          { key: 'title', used: true, final: '  Tres videos cortos  para TikTok ' },
          { key: 'description', used: true, final: 'Otra descripción escrita por la empresa' },
          { key: 'deliverables', used: false },
          { key: 'milestone:0', used: true, final: 'Guion\nEl guion\n- Un guion\n100' },
        ],
        jobId: '7b8f7c1e-0000-4000-8000-000000000000',
      });
      expect(prisma.assistantSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sug-1' },
        data: expect.objectContaining({
          outcome: 'resolved',
          fieldOutcomes: {
            title: 'accepted',
            description: 'edited',
            deliverables: 'discarded',
            'milestone:0': 'accepted',
          },
          finalTexts: { description: 'Otra descripción escrita por la empresa' },
        }),
      });
    });

    it("refuses someone else's suggestion as if it did not exist", async () => {
      await expect(
        service().outcome({ ...USER, sub: 'startup-2' }, 'sug-1', { parts: [] }),
      ).rejects.toThrow('No encontramos esa sugerencia');
    });
  });
});

describe('completedParts', () => {
  const json = JSON.stringify(DRAFT);

  it('sends nothing while the title is still being written', () => {
    const upToTitle = json.slice(0, json.indexOf('"description"') - 5);
    expect(completedParts(upToTitle, new Set())).toEqual([]);
  });

  it('sends each part once, as the next one starts', () => {
    const shown = new Set<never>();
    // The deliverables have only started: the description before them is done.
    const upToDeliverables = json.slice(0, json.indexOf('"deliverables"') + 20);
    expect(completedParts(upToDeliverables, shown).map((event) => (event as { key: string }).key)).toEqual([
      'title',
      'description',
    ]);
    const all = completedParts(json, shown).map((event) => (event as { key: string }).key);
    expect(all).toEqual(['deliverables', 'milestone:0', 'milestone:1']);
  });

  it('never sends a part that breaks a rule', () => {
    const bad = JSON.stringify({ ...DRAFT, title: 'Videos listos para el viernes' });
    const keys = completedParts(bad, new Set()).map((event) => (event as { key: string }).key);
    expect(keys).not.toContain('title');
    expect(keys).toContain('description');
  });
});

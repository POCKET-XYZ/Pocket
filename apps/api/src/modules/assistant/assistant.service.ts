import { partialParse } from '@anthropic-ai/sdk/_vendor/partial-json-parser/parser';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type AssistantKind, type UserRole } from '@prisma/client';
import { securityEvent } from '../../common/security/security-log';
import type { AuthUser } from '../../common/types/auth';
import { PrismaService } from '../../prisma/prisma.service';
import type { CleanKpi } from '../jobs/kpis';
import {
  DELIVERY_REPORT_PROMPT_VERSION,
  DELIVERY_REPORT_SYSTEM,
  deliveryReportUserMessage,
} from './delivery-report/prompt';
import { DELIVERY_REPORT_SCHEMA, type RawDeliveryReport } from './delivery-report/schema';
import {
  checkNote,
  finishReport,
  reportHasContent,
  reportNeedsRetry,
  type DeliveryReport,
} from './delivery-report/validate';
import type { DeliveryReportDto } from './dto/delivery-report.dto';
import type { JobDraftDto } from './dto/job-draft.dto';
import type { OutcomeDto } from './dto/outcome.dto';
import { JOB_DRAFT_PROMPT_VERSION, JOB_DRAFT_SYSTEM, jobDraftUserMessage } from './job-draft/prompt';
import { JOB_DRAFT_SCHEMA, type RawJobDraft } from './job-draft/schema';
import {
  checkMilestone,
  checkQuestions,
  checkText,
  failedParts,
  finishDraft,
  hasContent,
  LIMITS,
  type JobDraft,
  type PartKey,
  type SavedTemplate,
} from './job-draft/validate';
import { monthKey, resetsIn, startOfUtcDay, startOfUtcMonth } from './limits';
import { AssistantModel, MAX_OUTPUT_TOKENS, type ModelFailure, type ModelResult } from './model.client';
import { costUsd, maxCallCostUsd, type TokenUsage } from './pricing';
import { maskPersonalData } from './scrub';

/** The keys of a job draft in the order the answer writes them. */
const DRAFT_KEYS = JOB_DRAFT_SCHEMA.required;

/**
 * Room for a company's saved KPI templates in the cost held before a call:
 * 20 templates of 10 KPIs, each a name, a unit and a direction.
 */
const TEMPLATES_ALLOWANCE_CHARS = 20 * 10 * 140;

/** Requests one person may make in a minute, whatever comes of them. */
const PER_MINUTE = 5;

/** What the stream sends the web, one JSON object per line. */
export type AssistantEvent =
  | { type: 'status'; stage: 'writing' | 'adjusting' }
  | { type: 'part'; key: PartKey | 'note'; value: unknown }
  | { type: 'questions'; suggestionId: string; questions: string[] }
  | { type: 'done'; suggestionId: string; draft: JobDraft; remainingToday: number }
  | { type: 'report'; suggestionId: string; report: DeliveryReport; remainingToday: number }
  | { type: 'error'; message: string };

export interface Quota {
  available: boolean;
  /** Why not, in words for the screen. */
  message?: string;
  remainingToday: number;
  dailyLimit: number;
}

const MESSAGES = {
  unavailable: 'El asistente no está disponible ahora. Puedes escribirlo tú.',
  notVerified: 'El asistente está disponible para cuentas verificadas.',
  perMinute: 'Vas muy rápido. Intenta en un momento.',
  failed: 'No pudimos armar la sugerencia. Intenta con otras palabras.',
  daily: (now: Date) =>
    `Llegaste al límite de sugerencias de hoy. Tendrás más en ${resetsIn(now)}.`,
} as const;

/** A request refused before the model was asked. */
class Refused extends HttpException {
  constructor(
    readonly reason: string,
    status: HttpStatus,
    message: string,
  ) {
    super({ statusCode: status, message, reason }, status);
  }
}

/**
 * The Pocket assistant: it proposes, the person decides. Before every call
 * the checks run in a fixed order (on, verified, per minute, per day, the
 * month's budget) and a refused request never reaches the model. Every
 * request leaves a row with its real tokens and cost.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly enabled: boolean;
  private readonly dailyLimit: number;
  private readonly monthlyBudgetUsd: number;
  /** The share of the month's budget already reported, by month. */
  private readonly budgetAlerts = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly model: AssistantModel,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('assistant.enabled') ?? false;
    this.dailyLimit = config.get<number>('assistant.dailyLimit') ?? 20;
    this.monthlyBudgetUsd = config.get<number>('assistant.monthlyBudgetUsd') ?? 20;
  }

  /** Whether the person can ask now, and how many suggestions are left today. */
  async quota(user: AuthUser): Promise<Quota> {
    const now = new Date();
    const used = await this.usedToday(user.sub, now);
    const remainingToday = Math.max(0, this.dailyLimit - used);
    const base = { remainingToday, dailyLimit: this.dailyLimit };
    if (!this.on() || (await this.monthSpend(now)) >= this.monthlyBudgetUsd) {
      return { available: false, message: MESSAGES.unavailable, ...base };
    }
    if (!(await this.isVerified(user.sub))) {
      return { available: false, message: MESSAGES.notVerified, ...base };
    }
    if (remainingToday === 0) return { available: false, message: MESSAGES.daily(now), ...base };
    return { available: true, ...base };
  }

  /**
   * A job draft from what the company wrote, sent part by part through `emit`
   * as each part is written and passes its checks. Amounts, KPIs and notes
   * come at the end, with the whole draft. Throws before the first event when
   * the request is refused.
   */
  async jobDraft(user: AuthUser, dto: JobDraftDto, emit: (event: AssistantEvent) => void): Promise<void> {
    const request = maskPersonalData(dto.text);
    const followUp = dto.followUp
      ? { questions: dto.followUp.questions, answers: maskPersonalData(dto.followUp.answers) }
      : undefined;
    // The budget is read from everything the company wrote, its answers too.
    const written = followUp ? `${request}
${followUp.answers}` : request;
    // Loaded while the checks run; only used if they pass.
    const loading = this.templatesOf(user.sub);
    loading.catch(() => undefined);

    const row = await this.begin(user, 'job_draft', JOB_DRAFT_PROMPT_VERSION, {
      inputText: written,
      jobId: dto.jobId,
      estimatedInputTokens: Math.ceil(
        (JOB_DRAFT_SYSTEM.length + written.length + TEMPLATES_ALLOWANCE_CHARS) / 3,
      ),
      role: 'startup',
    });
    const templates = await loading;
    const userMessage = jobDraftUserMessage({
      request,
      category: dto.category,
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        kpis: template.kpis.map(({ name, unit, direction }) => ({ name, unit, direction })),
      })),
      followUp,
    });
    emit({ type: 'status', stage: 'writing' });

    const shown = new Set<PartKey>();
    const first = await this.model.generate({
      system: JOB_DRAFT_SYSTEM,
      user: userMessage,
      schema: JOB_DRAFT_SCHEMA,
      onText: (snapshot) => {
        for (const part of completedParts(snapshot, shown)) emit(part);
      },
    });
    const calls: ModelResult[] = [first];
    if (!first.ok) return this.fail(row, calls, first.reason, emit);

    let raw = first.json as RawJobDraft;
    if (raw.mode === 'questions') {
      const questions = checkQuestions(raw);
      // One round of questions at most: after the answers, it drafts.
      if (!followUp && questions.length > 0) {
        await this.finish(row, calls, { askedQuestions: true, output: { questions } });
        emit({ type: 'questions', suggestionId: row.id, questions });
        return;
      }
      emit({ type: 'status', stage: 'adjusting' });
      const again = await this.model.generate({
        system: JOB_DRAFT_SYSTEM,
        user: userMessage,
        schema: JOB_DRAFT_SCHEMA,
      });
      calls.push(again);
      if (!again.ok) return this.fail(row, calls, again.reason, emit);
      raw = again.json as RawJobDraft;
      if (raw.mode !== 'draft') return this.fail(row, calls, 'validation', emit);
    }

    // A part that broke a rule was held back: ask once more, and take that
    // part from the second answer only if it passes there.
    let retry: RawJobDraft | null = null;
    if (failedParts(raw).length > 0 && calls.length === 1) {
      emit({ type: 'status', stage: 'adjusting' });
      const again = await this.model.generate({
        system: JOB_DRAFT_SYSTEM,
        user: userMessage,
        schema: JOB_DRAFT_SCHEMA,
      });
      calls.push(again);
      if (again.ok && (again.json as RawJobDraft).mode === 'draft') retry = again.json as RawJobDraft;
    }

    const draft = finishDraft(raw, retry, written, templates);
    if (!hasContent(draft)) return this.fail(row, calls, 'validation', emit);
    await this.finish(row, calls, { output: draft, counts: true });
    const remainingToday = Math.max(0, this.dailyLimit - (await this.usedToday(user.sub, new Date())));
    emit({ type: 'done', suggestionId: row.id, draft, remainingToday });
  }

  /**
   * A delivery report from the expert's notes: the note for the company and
   * the result of each of the job's KPIs, a number only when the notes hold
   * it. Only the hired expert, on an active contract, for a milestone waiting
   * for its delivery.
   */
  async deliveryReport(
    user: AuthUser,
    dto: DeliveryReportDto,
    emit: (event: AssistantEvent) => void,
  ): Promise<void> {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: dto.milestoneId },
      select: {
        title: true,
        description: true,
        acceptanceCriteria: true,
        status: true,
        contract: {
          select: {
            specialistId: true,
            status: true,
            job: {
              select: {
                kpis: { orderBy: { position: 'asc' }, select: { id: true, name: true, unit: true } },
              },
            },
          },
        },
      },
    });
    // Someone else's milestone answers as if it did not exist.
    if (!milestone || milestone.contract.specialistId !== user.sub) {
      throw new NotFoundException('No encontramos ese hito');
    }
    if (
      milestone.contract.status !== 'active' ||
      (milestone.status !== 'pending' && milestone.status !== 'changes_requested')
    ) {
      throw new BadRequestException('Este hito no está esperando una entrega');
    }
    const notes = maskPersonalData(dto.notes);
    const kpis = milestone.contract.job.kpis;
    const userMessage = deliveryReportUserMessage({
      notes,
      milestone: {
        title: milestone.title,
        description: milestone.description,
        acceptanceCriteria: milestone.acceptanceCriteria,
      },
      kpis: kpis.map((kpi) => ({
        kpi_id: kpi.id,
        name: kpi.name,
        ...(kpi.unit ? { unit: kpi.unit } : {}),
      })),
    });
    const row = await this.begin(user, 'delivery_report', DELIVERY_REPORT_PROMPT_VERSION, {
      inputText: notes,
      milestoneId: dto.milestoneId,
      estimatedInputTokens: Math.ceil((DELIVERY_REPORT_SYSTEM.length + userMessage.length) / 3),
      role: 'specialist',
    });
    emit({ type: 'status', stage: 'writing' });

    let noteSent = false;
    const ask = (onText?: (snapshot: string) => void) =>
      this.model.generate({
        system: DELIVERY_REPORT_SYSTEM,
        user: userMessage,
        schema: DELIVERY_REPORT_SCHEMA,
        onText,
      });
    const first = await ask((snapshot) => {
      // The note is done once the KPI list has started.
      if (noteSent || !snapshot.includes('"kpi_values":')) return;
      noteSent = true;
      const partial = (partialParse(snapshot) ?? {}) as Partial<RawDeliveryReport>;
      const note = typeof partial.note === 'string' ? checkNote(partial.note, notes) : null;
      if (note) emit({ type: 'part', key: 'note', value: note });
    });
    const calls: ModelResult[] = [first];
    if (!first.ok) return this.fail(row, calls, first.reason, emit);
    const raw = first.json as RawDeliveryReport;
    let retry: RawDeliveryReport | null = null;
    if (reportNeedsRetry(raw, notes)) {
      emit({ type: 'status', stage: 'adjusting' });
      const again = await ask();
      calls.push(again);
      if (again.ok) retry = again.json as RawDeliveryReport;
    }
    const report = finishReport(raw, retry, notes, kpis);
    if (!reportHasContent(report)) return this.fail(row, calls, 'validation', emit);
    await this.finish(row, calls, { output: report, counts: true });
    const remainingToday = Math.max(0, this.dailyLimit - (await this.usedToday(user.sub, new Date())));
    emit({ type: 'report', suggestionId: row.id, report, remainingToday });
  }

  /**
   * How a suggestion ended up, sent when the job is posted or the delivery
   * sent: each part accepted as it was, edited, or discarded. Compared here
   * against what was shown, never taken from the browser.
   */
  async outcome(user: AuthUser, id: string, dto: OutcomeDto): Promise<void> {
    const suggestion = await this.prisma.assistantSuggestion.findUnique({ where: { id } });
    if (!suggestion || suggestion.userId !== user.sub) {
      throw new NotFoundException('No encontramos esa sugerencia');
    }
    const output = suggestion.outputJson as unknown as JobDraft | DeliveryReport | null;
    const outcomes: Record<string, 'accepted' | 'edited' | 'discarded'> = {};
    const finalTexts: Record<string, string> = {};
    for (const part of dto.parts) {
      const suggested = output ? partText(output, part.key) : null;
      if (suggested === null) continue;
      if (!part.used || part.final === undefined) {
        outcomes[part.key] = 'discarded';
      } else if (normalize(part.final) === normalize(suggested)) {
        outcomes[part.key] = 'accepted';
      } else {
        outcomes[part.key] = 'edited';
        finalTexts[part.key] = maskPersonalData(part.final);
      }
    }
    await this.prisma.assistantSuggestion.update({
      where: { id },
      data: {
        outcome: 'resolved',
        resolvedAt: new Date(),
        fieldOutcomes: outcomes,
        finalTexts,
        ...(dto.jobId ? { jobId: dto.jobId } : {}),
      },
    });
  }

  // --- Checks before asking -------------------------------------------------

  private on(): boolean {
    return this.enabled && this.model.usable;
  }

  /**
   * The checks, in order, then the row that holds the call's highest
   * possible cost against the month's budget while it runs. A refusal is
   * recorded too, at no cost, and thrown.
   */
  private async begin(
    user: AuthUser,
    kind: AssistantKind,
    promptVersion: string,
    options: {
      inputText: string;
      jobId?: string;
      milestoneId?: string;
      estimatedInputTokens: number;
      /** Who may ask for this kind of suggestion. */
      role: UserRole;
    },
  ) {
    const now = new Date();
    const refuse = async (reason: string, status: HttpStatus, message: string): Promise<never> => {
      await this.prisma.assistantSuggestion.create({
        data: {
          userId: user.sub,
          kind,
          promptVersion,
          model: this.model.model,
          status: 'rejected_precheck',
          failureReason: reason,
        },
      });
      throw new Refused(reason, status, message);
    };

    if (!this.on()) return refuse('disabled', HttpStatus.SERVICE_UNAVAILABLE, MESSAGES.unavailable);
    // Read together, judged in order: the first that fails is the one said.
    const [verified, lastMinute, usedToday, spent] = await Promise.all([
      this.isVerified(user.sub, options.role),
      this.prisma.assistantSuggestion.count({
        where: {
          userId: user.sub,
          status: { not: 'rejected_precheck' },
          createdAt: { gte: new Date(now.getTime() - 60_000) },
        },
      }),
      this.usedToday(user.sub, now),
      this.monthSpend(now),
    ]);
    if (!verified) return refuse('not_verified', HttpStatus.FORBIDDEN, MESSAGES.notVerified);
    if (lastMinute >= PER_MINUTE) {
      return refuse('per_minute', HttpStatus.TOO_MANY_REQUESTS, MESSAGES.perMinute);
    }
    if (usedToday >= this.dailyLimit) {
      return refuse('daily', HttpStatus.TOO_MANY_REQUESTS, MESSAGES.daily(now));
    }
    // A call, and the one retry it may need, at their highest possible cost.
    const hold =
      2 * maxCallCostUsd(this.model.model, options.estimatedInputTokens, MAX_OUTPUT_TOKENS);
    if (spent + hold > this.monthlyBudgetUsd) {
      await this.alertBudget(now);
      return refuse('monthly_budget', HttpStatus.SERVICE_UNAVAILABLE, MESSAGES.unavailable);
    }

    return this.prisma.assistantSuggestion.create({
      data: {
        userId: user.sub,
        kind,
        jobId: options.jobId,
        milestoneId: options.milestoneId,
        inputText: options.inputText,
        promptVersion,
        model: this.model.model,
        status: 'failed',
        failureReason: 'in_progress',
        costUsd: hold,
      },
    });
  }

  /** An approved account, of the given role when one is asked for. */
  private async isVerified(userId: string, role?: UserRole): Promise<boolean> {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, verificationStatus: true, deletedAt: true },
    });
    return (
      account !== null &&
      (role === undefined || account.role === role) &&
      account.verificationStatus === 'approved' &&
      account.deletedAt === null
    );
  }

  private usedToday(userId: string, now: Date): Promise<number> {
    return this.prisma.assistantSuggestion.count({
      where: { userId, countsTowardLimit: true, createdAt: { gte: startOfUtcDay(now) } },
    });
  }

  /** The month's spend, the calls still running included at their highest cost. */
  private async monthSpend(now: Date): Promise<number> {
    const total = await this.prisma.assistantSuggestion.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: startOfUtcMonth(now) } },
    });
    return Number(total._sum.costUsd ?? 0);
  }

  // --- Recording what happened --------------------------------------------

  private async finish(
    row: { id: string },
    calls: ModelResult[],
    result: { output: unknown; counts?: boolean; askedQuestions?: boolean },
  ): Promise<void> {
    await this.prisma.assistantSuggestion.update({
      where: { id: row.id },
      data: {
        ...this.spent(calls),
        status: 'shown',
        failureReason: null,
        outputJson: result.output as Prisma.InputJsonValue,
        countsTowardLimit: result.counts ?? false,
        askedQuestions: result.askedQuestions ?? false,
      },
    });
    await this.alertBudget(new Date());
  }

  private async fail(
    row: { id: string },
    calls: ModelResult[],
    reason: ModelFailure | 'validation',
    emit: (event: AssistantEvent) => void,
  ): Promise<void> {
    await this.prisma.assistantSuggestion.update({
      where: { id: row.id },
      data: { ...this.spent(calls), status: 'failed', failureReason: reason },
    });
    this.logger.warn(`Suggestion ${row.id} failed: ${reason}`);
    emit({ type: 'error', message: MESSAGES.failed });
    await this.alertBudget(new Date());
  }

  /** Tokens, cost and time of every call a suggestion took, added up. */
  private spent(calls: ModelResult[]) {
    const usage = calls.reduce<TokenUsage>(
      (sum, call) => ({
        inputTokens: sum.inputTokens + call.usage.inputTokens,
        outputTokens: sum.outputTokens + call.usage.outputTokens,
        cacheReadTokens: sum.cacheReadTokens + call.usage.cacheReadTokens,
        cacheWriteTokens: sum.cacheWriteTokens + call.usage.cacheWriteTokens,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    );
    const cost = calls.reduce((sum, call) => sum + costUsd(this.model.model, call.usage), 0);
    return {
      ...usage,
      costUsd: Math.round(cost * 1_000_000) / 1_000_000,
      latencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
      attempts: calls.length,
    };
  }

  /** Tells the team once a month at 80% of the budget, and again at 100%. */
  private async alertBudget(now: Date): Promise<void> {
    const spent = await this.monthSpend(now);
    const share = spent / this.monthlyBudgetUsd;
    const level = share >= 1 ? 1 : share >= 0.8 ? 0.8 : 0;
    const key = monthKey(now);
    if (level === 0 || (this.budgetAlerts.get(key) ?? 0) >= level) return;
    this.budgetAlerts.set(key, level);
    securityEvent(
      'assistant_budget',
      {
        month: key,
        spentUsd: Math.round(spent * 100) / 100,
        budgetUsd: this.monthlyBudgetUsd,
        state: level === 1 ? 'off until next month' : '80% used',
      },
      'alert',
    );
  }

  private async templatesOf(startupId: string): Promise<Array<SavedTemplate & { name: string }>> {
    const templates = await this.prisma.kpiTemplate.findMany({
      where: { startupId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, kpis: true },
    });
    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      kpis: template.kpis as unknown as CleanKpi[],
    }));
  }
}

/**
 * The parts of a job draft that are complete in the text written so far and
 * not sent yet, checked: a part that breaks a rule is never sent. A key is
 * complete once the next one has started, and a milestone once the next one
 * has, or the list closed.
 */
export function completedParts(snapshot: string, shown: Set<PartKey>): AssistantEvent[] {
  let partial: Partial<RawJobDraft>;
  try {
    partial = (partialParse(snapshot) ?? {});
  } catch {
    return [];
  }
  if (partial.mode !== 'draft') return [];
  const keys = Object.keys(partial);
  // The answer follows the schema's order: a key is done once the next one
  // has been opened. A quote inside a text is escaped, so `"description":`
  // only matches the key itself.
  const complete = (key: string) => {
    if (!keys.includes(key)) return false;
    const next = DRAFT_KEYS[DRAFT_KEYS.indexOf(key as keyof RawJobDraft) + 1];
    return keys.indexOf(key) < keys.length - 1 || (next !== undefined && snapshot.includes(`"${next}":`));
  };
  const events: AssistantEvent[] = [];
  for (const key of ['title', 'description', 'deliverables'] as const) {
    if (!complete(key) || shown.has(key) || typeof partial[key] !== 'string') continue;
    shown.add(key);
    const checked = checkText(partial[key], LIMITS[key]);
    if (checked.ok) events.push({ type: 'part', key, value: checked.value });
  }
  const milestones = Array.isArray(partial.milestones) ? partial.milestones : [];
  const listDone = complete('milestones');
  milestones.slice(0, 5).forEach((milestone, index) => {
    const key: PartKey = `milestone:${index}`;
    const done = listDone || index < milestones.length - 1;
    if (!done || shown.has(key)) return;
    shown.add(key);
    const checked = checkMilestone(milestone);
    if (checked.ok) events.push({ type: 'part', key, value: checked.value });
  });
  return events;
}

/** A part of a shown draft as one text, its fields one per line, to compare with the final one. */
export function partText(output: JobDraft | DeliveryReport, key: string): string | null {
  if ('note' in output) {
    if (key === 'note') return output.note;
    const [kind, index] = key.split(':');
    const kpi = kind === 'kpi' ? output.kpis[Number(index)] : undefined;
    return kpi && kpi.value !== null ? String(kpi.value) : null;
  }
  const draft = output;
  if (key === 'title' || key === 'description' || key === 'deliverables') return draft[key];
  const [kind, index] = key.split(':');
  if (kind === 'milestone') {
    const milestone = draft.milestones?.[Number(index)];
    if (!milestone) return null;
    return [milestone.title, milestone.description, milestone.acceptanceCriteria, milestone.amount ?? '']
      .join('\n');
  }
  if (kind === 'kpi') return draft.kpis?.[Number(index)]?.name ?? null;
  return null;
}

/** Spaces at the ends and runs of spaces do not make an edit. */
function normalize(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim();
}

import {
  BadRequestException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { monthKey } from './limits';
import { AssistantModel } from './model.client';
import { summarize, type AssistantUsage } from './usage';

/** A suggestion with no job or delivery after this long led nowhere. */
const NO_OUTCOME_AFTER_DAYS = 7;

/** What people wrote is kept this long; the numbers stay. */
const KEEP_TEXTS_DAYS = 365;

/** How often both are checked. */
const SWEEP_MS = 6 * 60 * 60 * 1000;

/**
 * The team's view of the assistant, and its upkeep: a suggestion that led
 * nowhere in a week is marked so (not counted as discarded), and texts older
 * than a year are cleared, keeping tokens, cost and outcomes.
 */
@Injectable()
export class AssistantAdminService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AssistantAdminService.name);
  private timer?: NodeJS.Timeout;
  private readonly enabled: boolean;
  private readonly budgetUsd: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly model: AssistantModel,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('assistant.enabled') ?? false;
    this.budgetUsd = config.get<number>('assistant.monthlyBudgetUsd') ?? 20;
  }

  onApplicationBootstrap(): void {
    // Background work stays off in tests and in local runs.
    if (process.env.NODE_ENV === 'test' || process.env.PLATFORM_MONITOR === 'off') return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
    void this.sweep();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** The month's numbers (UTC), the current one unless `month` is "YYYY-MM". */
  async usage(month?: string): Promise<AssistantUsage> {
    const now = new Date();
    const key = month ?? monthKey(now);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
      throw new BadRequestException('El mes va como AAAA-MM');
    }
    const [year, monthNumber] = key.split('-').map(Number);
    const from = new Date(Date.UTC(year, monthNumber - 1, 1));
    const to = new Date(Date.UTC(year, monthNumber, 1));
    const rows = await this.prisma.assistantSuggestion.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: {
        userId: true,
        kind: true,
        status: true,
        failureReason: true,
        costUsd: true,
        latencyMs: true,
        promptVersion: true,
        countsTowardLimit: true,
        askedQuestions: true,
        outcome: true,
        fieldOutcomes: true,
      },
    });
    return summarize(
      rows.map((row) => ({
        ...row,
        costUsd: Number(row.costUsd),
        fieldOutcomes: (row.fieldOutcomes ?? null) as Record<string, string> | null,
      })),
      { month: key, enabled: this.enabled && this.model.usable, model: this.model.model, budgetUsd: this.budgetUsd },
    );
  }

  /** Both upkeep steps; never throws. */
  async sweep(now = new Date()): Promise<{ noOutcome: number; cleared: number }> {
    try {
      const stale = await this.prisma.assistantSuggestion.updateMany({
        where: {
          status: 'shown',
          askedQuestions: false,
          outcome: null,
          createdAt: { lt: new Date(now.getTime() - NO_OUTCOME_AFTER_DAYS * 86_400_000) },
        },
        data: { outcome: 'no_outcome' },
      });
      const old = new Date(now.getTime() - KEEP_TEXTS_DAYS * 86_400_000);
      const cleared = await this.prisma.assistantSuggestion.updateMany({
        where: {
          createdAt: { lt: old },
          OR: [
            { inputText: { not: null } },
            { outputJson: { not: Prisma.DbNull } },
            { finalTexts: { not: Prisma.DbNull } },
          ],
        },
        data: { inputText: null, outputJson: Prisma.DbNull, finalTexts: Prisma.DbNull },
      });
      if (stale.count > 0 || cleared.count > 0) {
        this.logger.log(`Marked ${stale.count} without outcome, cleared ${cleared.count} old texts`);
      }
      return { noOutcome: stale.count, cleared: cleared.count };
    } catch (error) {
      this.logger.warn(`Assistant upkeep failed: ${(error as Error).message}`);
      return { noOutcome: 0, cleared: 0 };
    }
  }
}

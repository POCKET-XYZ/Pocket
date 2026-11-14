import type { AssistantKind, AssistantOutcome, AssistantStatus } from '@prisma/client';

/** One suggestion as the month's summary reads it. */
export interface UsageRow {
  userId: string;
  kind: AssistantKind;
  status: AssistantStatus;
  failureReason: string | null;
  costUsd: number;
  latencyMs: number;
  promptVersion: string;
  countsTowardLimit: boolean;
  askedQuestions: boolean;
  outcome: AssistantOutcome | null;
  fieldOutcomes: Record<string, string> | null;
}

export interface OutcomeCounts {
  accepted: number;
  edited: number;
  discarded: number;
}

export interface AssistantUsage {
  month: string;
  enabled: boolean;
  model: string;
  spend: {
    usd: number;
    budgetUsd: number;
    /** Spent over the budget, 0 to 1 and over. */
    share: number;
    /** What a suggestion that was shown cost on average. */
    perSuggestionUsd: number | null;
  };
  suggestions: Record<AssistantKind, { shown: number; failed: number; refused: number }>;
  /** Questions back instead of a draft: shown, not counted. */
  questions: number;
  people: number;
  outcomes: { resolved: number; noOutcome: number; waiting: number };
  /** Parts accepted, edited or discarded, all together and by kind of part. */
  parts: OutcomeCounts & { byPart: Array<OutcomeCounts & { part: string }> };
  byVersion: Array<OutcomeCounts & { version: string; suggestions: number }>;
  failures: Array<{ reason: string; count: number }>;
  latency: { averageMs: number | null; p90Ms: number | null };
}

const KINDS: AssistantKind[] = ['job_draft', 'delivery_report', 'delivery_review'];

/** "milestone:2" counts with every milestone, "kpi:0" with every KPI. */
function partGroup(key: string): string {
  return key.split(':')[0];
}

function tally(target: OutcomeCounts, outcome: string): void {
  if (outcome === 'accepted' || outcome === 'edited' || outcome === 'discarded') target[outcome] += 1;
}

const empty = (): OutcomeCounts => ({ accepted: 0, edited: 0, discarded: 0 });

/**
 * The month in numbers, from its rows: spend against the budget, what was
 * asked and shown, and what people did with each part. A suggestion still
 * waiting for its job or delivery is apart, and one that never led anywhere
 * is not counted as discarded.
 */
export function summarize(
  rows: UsageRow[],
  context: { month: string; enabled: boolean; model: string; budgetUsd: number },
): AssistantUsage {
  const suggestions = Object.fromEntries(
    KINDS.map((kind) => [kind, { shown: 0, failed: 0, refused: 0 }]),
  ) as AssistantUsage['suggestions'];
  const failures = new Map<string, number>();
  const byPart = new Map<string, OutcomeCounts>();
  const byVersion = new Map<string, OutcomeCounts & { suggestions: number }>();
  const parts = empty();
  const people = new Set<string>();
  const latencies: number[] = [];
  let spend = 0;
  let shownCost = 0;
  let shownCount = 0;
  let questions = 0;
  const outcomes = { resolved: 0, noOutcome: 0, waiting: 0 };

  for (const row of rows) {
    spend += row.costUsd;
    const counts = suggestions[row.kind];
    if (row.status === 'rejected_precheck') {
      counts.refused += 1;
      failures.set(row.failureReason ?? 'unknown', (failures.get(row.failureReason ?? 'unknown') ?? 0) + 1);
      continue;
    }
    if (row.status === 'failed') {
      counts.failed += 1;
      failures.set(row.failureReason ?? 'unknown', (failures.get(row.failureReason ?? 'unknown') ?? 0) + 1);
      continue;
    }
    counts.shown += 1;
    people.add(row.userId);
    shownCost += row.costUsd;
    shownCount += 1;
    latencies.push(row.latencyMs);
    if (row.askedQuestions) {
      questions += 1;
      continue;
    }
    const version = byVersion.get(row.promptVersion) ?? { ...empty(), suggestions: 0 };
    version.suggestions += 1;
    byVersion.set(row.promptVersion, version);
    if (row.outcome === 'resolved') outcomes.resolved += 1;
    else if (row.outcome === 'no_outcome') outcomes.noOutcome += 1;
    else outcomes.waiting += 1;
    for (const [key, outcome] of Object.entries(row.fieldOutcomes ?? {})) {
      const group = byPart.get(partGroup(key)) ?? empty();
      tally(group, outcome);
      byPart.set(partGroup(key), group);
      tally(parts, outcome);
      tally(version, outcome);
    }
  }

  latencies.sort((a, b) => a - b);
  return {
    month: context.month,
    enabled: context.enabled,
    model: context.model,
    spend: {
      usd: round(spend, 4),
      budgetUsd: context.budgetUsd,
      share: context.budgetUsd > 0 ? round(spend / context.budgetUsd, 4) : 0,
      perSuggestionUsd: shownCount > 0 ? round(shownCost / shownCount, 6) : null,
    },
    suggestions,
    questions,
    people: people.size,
    outcomes,
    parts: { ...parts, byPart: [...byPart].map(([part, counts]) => ({ part, ...counts })) },
    byVersion: [...byVersion].map(([version, counts]) => ({ version, ...counts })),
    failures: [...failures]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    latency: {
      averageMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      p90Ms: latencies.length > 0 ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.9))] : null,
    },
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

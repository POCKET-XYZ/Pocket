import type { TrackRecord, TrackRecordSummary } from '@pocket/shared';
import { Prisma } from '@prisma/client';
import { judgedKpis } from './dashboard';
import { buildReport, REPORT_INCLUDE } from './report';

/** What a specialist's track record is built from: only finished contracts count. */
export const TRACK_RECORD_INCLUDE = {
  ...REPORT_INCLUDE,
  startup: {
    select: {
      id: true,
      startupProfile: { select: { companyName: true, sector: true } },
    },
  },
  milestones: {
    orderBy: { position: 'asc' },
    include: {
      deliverables: { orderBy: { version: 'asc' }, include: { kpiResults: true } },
      disputes: { select: { id: true, specialistAmount: true } },
    },
  },
} satisfies Prisma.ContractInclude;

export type TrackRecordSource = Prisma.ContractGetPayload<{
  include: typeof TRACK_RECORD_INCLUDE;
}>;

/**
 * A specialist's work on Pocket: no amounts and no startup names, since this is
 * public. A dispute counts against them only when it went fully to the startup.
 */
export function trackRecordOf(sources: TrackRecordSource[], now: Date): TrackRecord {
  const jobs = sources
    .filter((source) => source.status === 'completed' && source.completedAt)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())
    .map((source) => {
      const report = buildReport(source, now);
      const lost = source.milestones.filter(
        (milestone) =>
          milestone.status === 'resolved' &&
          milestone.disputes.at(-1)?.specialistAmount?.isZero() === true,
      ).length;
      const onTime = Math.max(report.summary.milestones.onTime - lost, 0);
      return {
        milestones: { total: report.summary.milestones.total, onTime },
        job: {
          contractId: source.id,
          title: source.job.title,
          sector: source.startup.startupProfile?.sector ?? null,
          category: source.job.category,
          completedAt: source.completedAt!.toISOString(),
          kpis: judgedKpis(report),
          onTime: onTime === report.summary.milestones.total,
        },
      };
    });

  return {
    completed: jobs.length,
    milestones: {
      total: jobs.reduce((all, { milestones }) => all + milestones.total, 0),
      onTime: jobs.reduce((all, { milestones }) => all + milestones.onTime, 0),
    },
    kpis: {
      withTarget: jobs.reduce((all, { job }) => all + job.kpis.withTarget, 0),
      met: jobs.reduce((all, { job }) => all + job.kpis.met, 0),
    },
    jobs: jobs.map(({ job }) => job),
  };
}

/** The same counts without the list, for one line under each applicant. */
export function trackRecordSummaryOf(
  sources: TrackRecordSource[],
  now: Date,
): TrackRecordSummary {
  const { completed, milestones, kpis } = trackRecordOf(sources, now);
  return { completed, milestones, kpis };
}

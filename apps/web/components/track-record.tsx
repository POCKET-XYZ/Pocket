'use client';

import type { Applicant, TrackRecord } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { month, percent } from '@/lib/format';
import { applicantSummary, fetchTrackRecord } from '@/lib/track-record';

/**
 * What a specialist finished on Pocket, for their public profile. Nothing shows
 * while it loads, if it fails, or if they have no completed job yet: the rest of
 * the profile stands on its own.
 */
export function TrackRecordSection({ userId }: { userId: string }) {
  const record = useQuery({
    queryKey: ['profiles', userId, 'track-record'],
    queryFn: () => fetchTrackRecord(userId),
    retry: false,
  });
  if (!record.data || record.data.completed === 0) return null;
  const { data } = record;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial en Pocket</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid grid-cols-3 gap-4">
          {stats(data).map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse justify-end gap-1">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="font-heading text-2xl font-semibold text-navy">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        {data.bestResult ? (
          <div className="rounded-xl bg-celeste-light p-4">
            <p className="text-xs text-muted-foreground">Mejor resultado</p>
            <p className="mt-1 font-heading text-xl font-semibold text-navy">
              {data.bestResult.result}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                data.bestResult.sector,
                month(data.bestResult.reportedAt),
                'Aprobado por la startup',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        ) : null}
        <ul className="divide-y divide-border border-t border-border">
          {data.jobs.map((job) => (
            <li
              key={job.contractId}
              className="flex flex-col gap-2 py-4 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-navy">{job.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[job.sector, month(job.completedAt)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                {job.kpis.withTarget > 0 ? (
                  <Badge className="border-0 bg-celeste-light text-navy">
                    {job.kpis.met} de {job.kpis.withTarget}{' '}
                    {job.kpis.withTarget === 1 ? 'meta' : 'metas'}
                  </Badge>
                ) : null}
                <Badge
                  className={
                    job.onTime
                      ? 'border-0 bg-emerald-100 text-emerald-800'
                      : 'border-0 bg-yellow/40 text-navy'
                  }
                >
                  {job.onTime ? 'A tiempo' : 'Con retraso'}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function stats(record: TrackRecord): { label: string; value: string }[] {
  const { completed, milestones, kpis } = record;
  return [
    {
      label: completed === 1 ? 'Trabajo completado' : 'Trabajos completados',
      value: String(completed),
    },
    { label: 'Entregables a tiempo', value: percent(milestones.onTime, milestones.total) },
    { label: 'Metas cumplidas', value: percent(kpis.met, kpis.withTarget) },
  ];
}

/**
 * The one line a startup reads under each applicant while deciding. Shows nothing
 * until the API sends the counts: everyone would otherwise look new on Pocket.
 */
export function TrackRecordLine({ applicant }: { applicant: Applicant }) {
  const summary = applicantSummary(applicant.specialistId, applicant.trackRecord);
  if (!summary) return null;
  const { completed, milestones, kpis } = summary;

  return (
    <p className="mt-1 text-sm font-medium text-navy">
      {completed === 0
        ? 'Nuevo en Pocket'
        : [
            `${completed} ${completed === 1 ? 'trabajo' : 'trabajos'}`,
            `${percent(milestones.onTime, milestones.total)} a tiempo`,
            `${percent(kpis.met, kpis.withTarget)} metas`,
          ].join(' · ')}
    </p>
  );
}

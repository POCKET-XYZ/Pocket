'use client';

import type { Applicant, JobListing } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { HireDialog } from '@/components/hire-dialog';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { dateTime, usdc } from '@/lib/format';
import { linkHost, safeHref } from '@/lib/links';

export default function ApplicantsPage() {
  return <RequireAuth roles={['startup']}>{() => <Applicants />}</RequireAuth>;
}

function Applicants() {
  const { id } = useParams<{ id: string }>();
  const job = useQuery({
    queryKey: ['jobs', id],
    queryFn: () => api<JobListing>(`/jobs/${id}`),
  });
  const applicants = useQuery({
    queryKey: ['jobs', id, 'applicants'],
    queryFn: () => api<Applicant[]>(`/jobs/${id}/applications`),
  });

  if (job.isLoading || applicants.isLoading) return <Loading />;
  if (applicants.error) return <ErrorAlert error={applicants.error} />;
  const canHire = job.data?.status === 'open';

  return (
    <div>
      <PageHeader
        title="Applicants"
        description={
          <>
            For{' '}
            <Link href={`/jobs/${id}`} className="underline">
              {job.data?.title}
            </Link>
            , budget {usdc(job.data?.budget)}.
          </>
        }
      />
      {applicants.data && applicants.data.length > 0 ? (
        <div className="space-y-4">
          {applicants.data.map((applicant) => (
            <Card key={applicant.id}>
              <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/specialists/${applicant.specialistId}`}
                      className="font-heading text-lg font-semibold text-navy hover:underline"
                    >
                      {applicant.specialist?.displayName ?? 'Specialist'}
                    </Link>
                    <StatusBadge status={applicant.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {applicant.specialist?.headline}
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm">{applicant.approach}</p>
                  {applicant.similarWorkUrl ? (
                    <p className="mt-2 text-sm">
                      <span className="text-muted-foreground">Similar work: </span>
                      <a
                        href={safeHref(applicant.similarWorkUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all underline"
                      >
                        {applicant.similarWorkUrl}
                      </a>{' '}
                      <span className="text-xs text-muted-foreground">
                        ({linkHost(applicant.similarWorkUrl)})
                      </span>
                    </p>
                  ) : null}
                  {applicant.needsFromStartup ? (
                    <p className="mt-2 whitespace-pre-line text-sm">
                      <span className="text-muted-foreground">Needs from you: </span>
                      {applicant.needsFromStartup}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Applied {dateTime(applicant.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                  <p className="text-lg font-semibold text-navy">
                    {usdc(applicant.price)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {applicant.estimatedDays} days
                  </p>
                  {canHire && applicant.status === 'submitted' ? (
                    <HireDialog applicant={applicant} job={job.data} />
                  ) : applicant.contract ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/contracts/${applicant.contract.id}`}>
                        View contract
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No applications yet">
          Verified specialists will apply from the job board.
        </EmptyState>
      )}
    </div>
  );
}

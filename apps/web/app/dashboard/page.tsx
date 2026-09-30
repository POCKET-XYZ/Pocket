'use client';

import type { JobListing, User } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { JobCard } from '@/components/job-card';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { Onboarding } from '@/components/onboarding';
import { RequireAuth } from '@/components/require-auth';
import { UsdcStatus } from '@/components/usdc-status';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export default function DashboardPage() {
  return (
    <RequireAuth roles={['startup']} verified>
      {(user) => <Dashboard user={user} />}
    </RequireAuth>
  );
}

function Dashboard({ user }: { user: User }) {
  const jobs = useQuery({
    queryKey: ['jobs', 'mine'],
    queryFn: () => api<JobListing[]>('/jobs/mine'),
  });

  return (
    <div className="space-y-6">
      <Onboarding className="mb-6" />
      <PageHeader
        title="My jobs"
        description="Everything you posted, from open to completed."
        actions={
          <Button asChild>
            <Link href="/jobs/new">Post a job</Link>
          </Button>
        }
      />
      <UsdcStatus user={user} />
      {jobs.isLoading ? (
        <Loading />
      ) : jobs.error ? (
        <ErrorAlert error={jobs.error} />
      ) : jobs.data && jobs.data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.data.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              showStatus
              // The applicants page leads to the contract once someone is hired.
              href={`/jobs/${job.id}/applicants`}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="You have not posted a job yet">
          <Button asChild className="mt-4">
            <Link href="/jobs/new">Post your first job</Link>
          </Button>
        </EmptyState>
      )}
    </div>
  );
}

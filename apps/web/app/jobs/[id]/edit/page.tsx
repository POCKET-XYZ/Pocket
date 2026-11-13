'use client';

import type { JobListing, User } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { JobForm } from '@/components/job-form';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export default function EditDraftPage() {
  return (
    <RequireAuth roles={['startup']} verified>
      {(user) => <EditDraft user={user} />}
    </RequireAuth>
  );
}

/** A draft changes as a whole until it is posted; a posted job no longer does. */
function EditDraft({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>();
  const job = useQuery({
    queryKey: ['jobs', id],
    queryFn: () => api<JobListing>(`/jobs/${id}`),
  });

  if (job.isLoading) return <Loading />;
  if (job.error || !job.data) {
    return (
      <ErrorAlert
        error={job.error}
        onRetry={() => job.refetch()}
        title="No se encontró el trabajo"
      />
    );
  }
  if (job.data.startupId !== user.id || job.data.status !== 'draft') {
    return (
      <EmptyState title="Este trabajo ya no se puede editar">
        Solo se edita un borrador tuyo. Un trabajo publicado ya no cambia, porque los
        expertos se postulan a lo que leyeron.
        <div>
          <Button asChild className="mt-4">
            <Link href={`/jobs/${id}`}>Ver el trabajo</Link>
          </Button>
        </div>
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Editar borrador"
        description="Revisa cada parte, ajusta lo que haga falta y publícalo cuando esté listo. Solo tú lo ves hasta entonces."
        actions={
          <Button asChild variant="outline">
            <Link href={`/jobs/${id}`}>Volver al borrador</Link>
          </Button>
        }
      />
      <JobForm key={job.data.updatedAt} draft={job.data} />
    </div>
  );
}

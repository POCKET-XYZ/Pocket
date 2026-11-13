'use client';

import Link from 'next/link';
import { JobForm } from '@/components/job-form';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { useMyProfile } from '@/lib/use-my-profile';

export default function NewJobPage() {
  return (
    <RequireAuth roles={['startup']} verified>
      {() => <ProfileFirst />}
    </RequireAuth>
  );
}

/** Specialists judge a job by the startup behind it: the profile comes first. */
function ProfileFirst() {
  const profile = useMyProfile();
  if (profile.isLoading) return <Loading />;
  if (profile.error)
    return <ErrorAlert error={profile.error} onRetry={() => profile.refetch()} />;
  if (!profile.data) {
    return (
      <EmptyState title="Primero completa el perfil de tu startup">
        Los expertos lo leen antes de postularse.
        <div>
          <Button asChild className="mt-4">
            <Link href="/profile">Crear perfil</Link>
          </Button>
        </div>
      </EmptyState>
    );
  }
  return <NewJob />;
}

function NewJob() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Publicar un trabajo"
        description="Di qué necesitas, cómo se paga y qué debe cumplir cada entrega. Los expertos se postulan con una propuesta y un precio. Si aún no está listo, guárdalo como borrador."
      />
      <JobForm />
    </div>
  );
}

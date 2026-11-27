'use client';

import type { StartupDirectory } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { WaitingBadge } from '@/components/identity-seal';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

/** Who is hiring on Pocket, so a specialist can look before applying. */
export default function StartupsPage() {
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim());

  const directory = useQuery({
    queryKey: ['startups', query],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (query) params.set('search', query);
      return api<StartupDirectory>(`/profiles/startups?${params.toString()}`);
    },
  });

  return (
    <div>
      <PageHeader
        title="Empresas"
        description="Empresas con su perfil completo en Pocket. Mira quiénes son y para qué contratan antes de postularte."
      />
      <div className="mb-6 flex justify-end">
        <Input
          placeholder="Busca por nombre o sector"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="md:w-72"
        />
      </div>
      {directory.isLoading ? (
        <Loading />
      ) : directory.error ? (
        <ErrorAlert error={directory.error} onRetry={() => directory.refetch()} />
      ) : directory.data && directory.data.items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {directory.data.items.map((startup) => (
            <Link
              key={startup.id}
              href={`/empresas/${startup.id}`}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition hover:border-celeste hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Avatar name={startup.companyName} url={startup.logoUrl} />
                <div className="min-w-0">
                  <p className="truncate font-heading text-lg font-bold text-navy group-hover:underline">
                    {startup.companyName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {startup.oneLiner}
                  </p>
                  {startup.waiting ? <WaitingBadge className="mt-1.5" /> : null}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge
                  variant="secondary"
                  className="h-auto max-w-full whitespace-normal border-0 bg-celeste-light text-navy"
                >
                  {startup.sector}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {startup.openJobs === 0
                  ? 'Sin trabajos abiertos por ahora'
                  : startup.openJobs === 1
                    ? '1 trabajo abierto'
                    : `${startup.openJobs} trabajos abiertos`}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <NoStartups query={query} />
      )}
    </div>
  );
}

/** An empty directory and a search that found nothing are not the same news. */
function NoStartups({ query }: { query: string }) {
  return query ? (
    <EmptyState title={`Ninguna empresa coincide con «${query}»`}>
      Prueba con otra búsqueda.
    </EmptyState>
  ) : (
    <EmptyState title="Todavía no hay empresas con su perfil publicado">
      Cuando una empresa activa su cuenta y completa su perfil, aparece aquí.
    </EmptyState>
  );
}

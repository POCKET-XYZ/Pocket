'use client';

import type { StartupDirectory } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { STAGE_LABELS } from '@/lib/format';

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
        title="Startups"
        description="Every startup here was reviewed by a Pocket manager. See who they are and what they are hiring for before you apply."
      />
      <div className="mb-6 flex justify-end">
        <Input
          placeholder="Search by name or sector"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="md:w-72"
        />
      </div>
      {directory.isLoading ? (
        <Loading />
      ) : directory.error ? (
        <ErrorAlert error={directory.error} />
      ) : directory.data && directory.data.items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {directory.data.items.map((startup) => (
            <Link
              key={startup.id}
              href={`/startups/${startup.userId}`}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition hover:border-celeste hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Avatar name={startup.companyName} url={startup.logoUrl} />
                <div className="min-w-0">
                  <p className="truncate font-heading text-lg font-semibold text-navy group-hover:underline">
                    {startup.companyName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {startup.oneLiner}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="border-0 bg-celeste-light text-navy">
                  {startup.sector}
                </Badge>
                <Badge variant="outline">{STAGE_LABELS[startup.stage]}</Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {startup.openJobs === 0
                  ? 'No open jobs right now'
                  : startup.openJobs === 1
                    ? '1 open job'
                    : `${startup.openJobs} open jobs`}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No startups match">Try another search.</EmptyState>
      )}
    </div>
  );
}

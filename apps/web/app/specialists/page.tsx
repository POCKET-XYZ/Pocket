'use client';

import type { ServiceCategory, SpecialistDirectory } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { CategoryFilter } from '@/components/category-filter';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, usdc } from '@/lib/format';

export default function SpecialistsPage() {
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim());

  const directory = useQuery({
    queryKey: ['specialists', category, query],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (category) params.set('category', category);
      if (query) params.set('search', query);
      return api<SpecialistDirectory>(`/profiles/specialists?${params.toString()}`);
    },
  });

  return (
    <div>
      <PageHeader
        title="Specialists"
        description="Every specialist here was reviewed by a Pocket manager. To hire one, post a job and invite them to apply."
      />
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CategoryFilter value={category} onChange={setCategory} />
        <Input
          placeholder="Search by skill or headline"
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
          {directory.data.items.map((specialist) => (
            <Link
              key={specialist.id}
              href={`/specialists/${specialist.userId}`}
              className="group rounded-2xl border border-border bg-card p-5 transition hover:border-celeste hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Avatar name={specialist.displayName} />
                <div className="min-w-0">
                  <p className="truncate font-heading text-lg font-semibold text-navy group-hover:underline">
                    {specialist.displayName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {specialist.headline}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {specialist.categories.map((category) => (
                  <Badge
                    key={category}
                    variant="secondary"
                    className="border-0 bg-celeste-light text-navy"
                  >
                    {CATEGORY_LABELS[category]}
                  </Badge>
                ))}
              </div>
              {specialist.hourlyRate ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {usdc(specialist.hourlyRate)} / hour
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No specialists match">
          Try another category or search.
        </EmptyState>
      )}
    </div>
  );
}

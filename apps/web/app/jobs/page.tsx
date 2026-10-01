'use client';

import type { JobBoard, ServiceCategory } from '@pocket/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CategoryFilter } from '@/components/category-filter';
import { JobCard } from '@/components/job-card';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export default function JobsPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim());

  // Fifty at a time, the most the API hands out; more on demand.
  const board = useInfiniteQuery({
    queryKey: ['jobs', 'board', category, query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50', offset: String(pageParam) });
      if (category) params.set('category', category);
      if (query) params.set('search', query);
      return api<JobBoard>(`/jobs?${params.toString()}`);
    },
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total
        ? last.offset + last.items.length
        : undefined,
  });
  const jobs = board.data?.pages.flatMap((page) => page.items) ?? [];
  const total = board.data?.pages[0]?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Open jobs"
        description="Work posted by verified startups. Every job is paid through escrow."
        actions={
          user?.role === 'startup' ? (
            <Button asChild>
              <Link href="/jobs/new">Post a job</Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CategoryFilter value={category} onChange={setCategory} />
        <Input
          placeholder="Search jobs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="md:w-72"
        />
      </div>

      {board.isLoading ? (
        <Loading />
      ) : board.error ? (
        <ErrorAlert error={board.error} />
      ) : jobs.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} href={`/jobs/${job.id}`} />
            ))}
          </div>
          {board.hasNextPage ? (
            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {jobs.length} of {total}
              </p>
              <Button
                variant="outline"
                disabled={board.isFetchingNextPage}
                onClick={() => void board.fetchNextPage()}
              >
                {board.isFetchingNextPage ? 'Loading...' : 'Show more jobs'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState title="No open jobs match">
          Try another category or search.
        </EmptyState>
      )}
    </div>
  );
}

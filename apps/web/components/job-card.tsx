import type { JobListing } from '@pocket/shared';
import { CalendarIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { CATEGORY_LABELS, date, usdc } from '@/lib/format';

export function JobCard({
  job,
  href,
  showStatus = false,
}: {
  job: JobListing;
  href: string;
  showStatus?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition hover:border-celeste hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <Badge variant="secondary" className="border-0 bg-celeste-light text-navy">
          {CATEGORY_LABELS[job.category]}
        </Badge>
        {showStatus ? <StatusBadge status={job.status} /> : null}
      </div>
      <h3 className="mt-3 font-heading text-lg font-semibold text-navy group-hover:underline">
        {job.title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {job.startup?.companyName ?? 'Una startup verificada'}
      </p>
      <p className="mt-3 line-clamp-2 text-sm text-foreground/80">{job.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="font-semibold text-navy">{usdc(job.budget)}</span>
        <span className="flex items-center gap-1">
          <CalendarIcon className="size-3.5" /> {date(job.deadline)}
        </span>
        <span className="flex items-center gap-1">
          <UsersIcon className="size-3.5" /> {job.applicationCount}{' '}
          {job.applicationCount === 1 ? 'postulante' : 'postulantes'}
        </span>
      </div>
    </Link>
  );
}

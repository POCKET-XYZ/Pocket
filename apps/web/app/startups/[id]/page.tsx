'use client';

import type { JobBoard, PublicProfile, StartupProfile } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { GlobeIcon, LanguagesIcon, MapPinIcon } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Avatar } from '@/components/avatar';
import { JobCard } from '@/components/job-card';
import { Detail, EmptyState, ErrorAlert, Loading } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { STAGE_LABELS, date, shortAddress } from '@/lib/format';

/**
 * A startup's public profile. A specialist reads it before applying: who the
 * company is, what it is looking for, who signs, and what else it is hiring for.
 */
export default function StartupProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useQuery({
    queryKey: ['profiles', id],
    queryFn: () => api<PublicProfile>(`/profiles/${id}`),
  });
  const jobs = useQuery({
    queryKey: ['jobs', 'by-startup', id],
    queryFn: () => api<JobBoard>(`/jobs?startupId=${id}&limit=50`),
  });

  // A specialist's id opened here belongs on the specialist page.
  const isSpecialist = profile.data?.role === 'specialist';
  useEffect(() => {
    if (isSpecialist) router.replace(`/specialists/${id}`);
  }, [isSpecialist, id, router]);

  if (profile.isLoading || isSpecialist) return <Loading />;
  if (profile.error || !profile.data)
    return <ErrorAlert error={profile.error} title="Startup not found" />;

  const startup = profile.data.profile as StartupProfile;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={startup.companyName} url={startup.logoUrl} size={80} />
            <div>
              <h1 className="text-3xl font-bold text-navy">{startup.companyName}</h1>
              <p className="text-muted-foreground">{startup.oneLiner}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="border-0 bg-celeste-light text-navy">
                  {startup.sector}
                </Badge>
                <Badge variant="outline">{STAGE_LABELS[startup.stage]}</Badge>
              </div>
            </div>
          </div>
          {startup.websiteUrl ? (
            <Button asChild variant="outline">
              <a href={startup.websiteUrl} target="_blank" rel="noreferrer">
                <GlobeIcon className="size-4" /> Website
              </a>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>What they are looking for</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {startup.lookingFor}
            </p>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>The company</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              {startup.legalName ? (
                <Detail label="Registered name">{startup.legalName}</Detail>
              ) : null}
              {startup.contactRole ? (
                <Detail label="Who signs the contracts">{startup.contactRole}</Detail>
              ) : null}
              {startup.location ? (
                <Detail label="Based in">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinIcon className="size-3.5" /> {startup.location}
                  </span>
                </Detail>
              ) : null}
              {startup.languages.length > 0 ? (
                <Detail label="Works in">
                  <span className="inline-flex items-center gap-1.5">
                    <LanguagesIcon className="size-3.5" /> {startup.languages.join(', ')}
                  </span>
                </Detail>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-xl font-semibold text-navy">Open jobs</h2>
        {jobs.isLoading ? (
          <Loading />
        ) : jobs.data && jobs.data.items.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {jobs.data.items.map((job) => (
              <JobCard key={job.id} job={job} href={`/jobs/${job.id}`} />
            ))}
          </div>
        ) : (
          <EmptyState title="No open jobs right now">
            Check back later, or browse the rest of the board.
          </EmptyState>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Verified by Pocket. Member since {date(profile.data.memberSince)}. Wallet{' '}
        {shortAddress(profile.data.stellarAddress)}.
      </p>
    </div>
  );
}

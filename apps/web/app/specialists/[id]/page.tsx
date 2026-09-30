'use client';

import type { CaseStudy, PublicProfile, SpecialistProfile } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import {
  BriefcaseIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  LanguagesIcon,
  MapPinIcon,
  TrendingUpIcon,
  UserRoundIcon,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Avatar } from '@/components/avatar';
import { Detail, ErrorAlert, Loading } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, date, usdc } from '@/lib/format';
import { linkHost, safeHref } from '@/lib/links';

/**
 * A specialist's public profile, laid out the way a startup reads a CV: who
 * they are and how to check them first, then the work they have done with what
 * it achieved, then the practical details for working together.
 */
export default function SpecialistProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useQuery({
    queryKey: ['profiles', id],
    queryFn: () => api<PublicProfile>(`/profiles/${id}`),
  });

  // Startups used to be linked here; send those links to where startups live.
  const isStartup = profile.data?.role === 'startup';
  useEffect(() => {
    if (isStartup) router.replace(`/startups/${id}`);
  }, [isStartup, id, router]);

  if (profile.isLoading || isStartup) return <Loading />;
  if (profile.error || !profile.data)
    return <ErrorAlert error={profile.error} title="Profile not found" />;

  const specialist = profile.data.profile as SpecialistProfile;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Header specialist={specialist} />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {specialist.bio}
              </p>
            </CardContent>
          </Card>

          <PastWork caseStudies={specialist.caseStudies} />

          {specialist.tools.length > 0 || specialist.skills.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Tools and skills</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tags title="Tools" values={specialist.tools} />
                <Tags title="Skills" values={specialist.skills} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <WorkingTogether specialist={specialist} />
      </div>

      <p className="text-xs text-muted-foreground">
        Verified by Pocket. Member since {date(profile.data.memberSince)}. Wallet{' '}
        {profile.data.wallet}.
      </p>
    </div>
  );
}

/** Name, role, specialties, and the three ways to check them, up front. */
function Header({ specialist }: { specialist: SpecialistProfile }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={specialist.displayName} url={specialist.avatarUrl} size={80} />
          <div>
            <h1 className="text-3xl font-bold text-navy">{specialist.displayName}</h1>
            <p className="text-muted-foreground">{specialist.headline}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
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
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
          {specialist.cvUrl ? (
            <Button asChild>
              <a
                href={safeHref(specialist.cvUrl)}
                title={linkHost(specialist.cvUrl)}
                target="_blank"
                rel="noreferrer"
              >
                <FileTextIcon className="size-4" /> View CV
              </a>
            </Button>
          ) : null}
          {specialist.portfolioUrl ? (
            <Button asChild variant="outline">
              <a
                href={safeHref(specialist.portfolioUrl)}
                title={linkHost(specialist.portfolioUrl)}
                target="_blank"
                rel="noreferrer"
              >
                <GlobeIcon className="size-4" /> Portfolio
              </a>
            </Button>
          ) : null}
          {specialist.linkedinUrl ? (
            <Button asChild variant="outline">
              <a
                href={safeHref(specialist.linkedinUrl)}
                title={linkHost(specialist.linkedinUrl)}
                target="_blank"
                rel="noreferrer"
              >
                <UserRoundIcon className="size-4" /> LinkedIn
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Past work with what it achieved: the best signal a growth specialist can give. */
function PastWork({ caseStudies }: { caseStudies: CaseStudy[] }) {
  if (caseStudies.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Past work</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {caseStudies.map((study) => (
          <a
            key={study.url}
            href={safeHref(study.url)}
            title={linkHost(study.url)}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-3 rounded-xl border border-border p-4 transition hover:border-celeste"
          >
            <TrendingUpIcon className="mt-0.5 size-5 shrink-0 text-navy" />
            <div className="min-w-0">
              <p className="font-medium text-navy">
                {study.result || 'See the work'}
              </p>
              <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground group-hover:underline">
                {study.url} <ExternalLinkIcon className="size-3 shrink-0" />
              </p>
            </div>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}

/** What a startup needs to know before hiring: experience, time, place, price. */
function WorkingTogether({ specialist }: { specialist: SpecialistProfile }) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Working together</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-4">
          {specialist.yearsExperience != null ? (
            <Detail label="Experience">
              <span className="inline-flex items-center gap-1.5">
                <BriefcaseIcon className="size-3.5" />
                {specialist.yearsExperience}{' '}
                {specialist.yearsExperience === 1 ? 'year' : 'years'}
              </span>
            </Detail>
          ) : null}
          {specialist.languages.length > 0 ? (
            <Detail label="Languages">
              <span className="inline-flex items-center gap-1.5">
                <LanguagesIcon className="size-3.5" />
                {specialist.languages.join(', ')}
              </span>
            </Detail>
          ) : null}
          {specialist.location || specialist.timezone ? (
            <Detail label="Based in">
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon className="size-3.5" />
                {[specialist.location, specialist.timezone].filter(Boolean).join(' · ')}
              </span>
            </Detail>
          ) : null}
          {specialist.weeklyHours ? (
            <Detail label="Availability">
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="size-3.5" />
                {specialist.weeklyHours} hours a week
              </span>
            </Detail>
          ) : null}
          {specialist.hourlyRate ? (
            <Detail label="Hourly rate">{usdc(specialist.hourlyRate)}</Detail>
          ) : null}
          {specialist.minProjectBudget ? (
            <Detail label="Smallest project">{usdc(specialist.minProjectBudget)}</Detail>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function Tags({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge key={value} variant="outline">
            {value}
          </Badge>
        ))}
      </div>
    </section>
  );
}

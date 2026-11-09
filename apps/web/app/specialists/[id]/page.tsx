'use client';

import {
  ServiceCategory,
  type CaseStudy,
  type PublicProfile,
  type SocialAccount,
  type SpecialistProfile,
} from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  LanguagesIcon,
  MapPinIcon,
  MegaphoneIcon,
  TrendingUpIcon,
  UserRoundIcon,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Avatar } from '@/components/avatar';
import { IdentitySeal } from '@/components/identity-seal';
import { Detail, ErrorAlert, Loading } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { TrackRecordSection } from '@/components/track-record';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, PLATFORM_LABELS, date } from '@/lib/format';
import { linkHost, safeHref } from '@/lib/links';

/**
 * A specialist's public profile, laid out the way a startup reads a CV: who
 * they are and how to check them first, then the work they finished on Pocket
 * and the work they have done elsewhere with what it achieved, then the practical details for working together.
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
    return (
      <ErrorAlert
        error={profile.error}
        onRetry={() => profile.refetch()}
        title="No se encontró el perfil"
      />
    );

  const specialist = profile.data.profile as SpecialistProfile;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Header specialist={specialist} identityVerified={profile.data.identityVerified} />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Sobre mí</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {specialist.bio}
              </p>
            </CardContent>
          </Card>

          {specialist.categories.includes(ServiceCategory.Content) ? (
            <Audience specialist={specialist} />
          ) : null}
          <TrackRecordSection userId={id} />

          <PastWork caseStudies={specialist.caseStudies} />

          {specialist.tools.length > 0 || specialist.skills.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Herramientas y habilidades</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tags title="Herramientas" values={specialist.tools} />
                <Tags title="Habilidades" values={specialist.skills} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <WorkingTogether specialist={specialist} />
      </div>

      <p className="text-xs text-muted-foreground">
        {profile.data.waiting
          ? 'Se registró en la red de pruebas de Pocket y todavía no activa su cuenta aquí.'
          : `Miembro de Pocket desde el ${date(profile.data.memberSince)}.`}
      </p>
    </div>
  );
}

/** Name, role, specialties, and the three ways to check them, up front. */
function Header({
  specialist,
  identityVerified,
}: {
  specialist: SpecialistProfile;
  identityVerified: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={specialist.displayName} size={80} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold text-navy">{specialist.displayName}</h1>
              {identityVerified ? <IdentitySeal /> : null}
            </div>
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
          {specialist.categories.includes(ServiceCategory.Content)
            ? specialist.socialAccounts?.map((account) => (
                <Button key={account.url} asChild variant="outline">
                  <a
                    href={safeHref(account.url)}
                    title={linkHost(account.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MegaphoneIcon className="size-4" />{' '}
                    {PLATFORM_LABELS[account.platform]}
                  </a>
                </Button>
              ))
            : null}
          {specialist.cvUrl ? (
            <Button asChild>
              <a
                href={safeHref(specialist.cvUrl)}
                title={linkHost(specialist.cvUrl)}
                target="_blank"
                rel="noreferrer"
              >
                <FileTextIcon className="size-4" /> Ver CV
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
                <GlobeIcon className="size-4" /> Portafolio
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

/**
 * A creator's accounts and who they reach. Pocket checks none of these figures,
 * so each one says so, says how old it is and links to the account to compare.
 */
function Audience({ specialist }: { specialist: SpecialistProfile }) {
  const socialAccounts = specialist.socialAccounts ?? [];
  const niches = specialist.niches ?? [];
  const audienceCountries = specialist.audienceCountries ?? [];
  if (
    socialAccounts.length === 0 &&
    niches.length === 0 &&
    audienceCountries.length === 0
  )
    return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audiencia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {socialAccounts.map((account) => (
          <SocialAccountRow key={account.url} account={account} />
        ))}
        <Tags title="Nichos" values={niches} />
        <Tags title="Países de la audiencia" values={audienceCountries} />
      </CardContent>
    </Card>
  );
}

function SocialAccountRow({ account }: { account: SocialAccount }) {
  const figures = [
    account.followers != null
      ? `${account.followers.toLocaleString('es')} seguidores`
      : null,
    account.avgViews != null
      ? `${account.avgViews.toLocaleString('es')} vistas promedio`
      : null,
  ].filter(Boolean);
  return (
    <a
      href={safeHref(account.url)}
      title={linkHost(account.url)}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-xl border border-border p-4 transition hover:border-celeste"
    >
      <p className="flex items-center gap-1 font-medium text-navy group-hover:underline">
        {PLATFORM_LABELS[account.platform]}{' '}
        <ExternalLinkIcon className="size-3 shrink-0" />
      </p>
      {figures.length > 0 ? (
        <>
          <p className="mt-1 text-sm">{figures.join(' · ')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Declarado por el creador, sin verificar por Pocket
            {account.statsUpdatedAt ? ` · ${month(account.statsUpdatedAt)}` : ''}
          </p>
        </>
      ) : null}
    </a>
  );
}

function month(value: string): string {
  return new Date(value).toLocaleDateString('es', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** Past work with what it achieved: the best signal a growth specialist can give. */
function PastWork({ caseStudies }: { caseStudies: CaseStudy[] }) {
  if (caseStudies.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Casos de éxito</CardTitle>
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
              <p className="font-medium text-navy">{study.result || 'Ver el trabajo'}</p>
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

/** What a startup needs to know before hiring: language, place and time. */
function WorkingTogether({ specialist }: { specialist: SpecialistProfile }) {
  if (
    specialist.languages.length === 0 &&
    !specialist.location &&
    !specialist.timezone &&
    !specialist.weeklyHours
  )
    return null;
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Para trabajar juntos</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-4">
          {specialist.languages.length > 0 ? (
            <Detail label="Idiomas">
              <span className="inline-flex items-center gap-1.5">
                <LanguagesIcon className="size-3.5" />
                {specialist.languages.join(', ')}
              </span>
            </Detail>
          ) : null}
          {specialist.location || specialist.timezone ? (
            <Detail label="Ubicación">
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon className="size-3.5" />
                {[specialist.location, specialist.timezone].filter(Boolean).join(' · ')}
              </span>
            </Detail>
          ) : null}
          {specialist.weeklyHours ? (
            <Detail label="Disponibilidad">
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="size-3.5" />
                {specialist.weeklyHours}{' '}
                {specialist.weeklyHours === 1 ? 'hora por semana' : 'horas por semana'}
              </span>
            </Detail>
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

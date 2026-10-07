'use client';

import {
  ServiceCategory,
  StartupStage,
  type CaseStudy,
  type SpecialistProfile,
  type StartupProfile,
  type User,
  type VerificationRequest,
} from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, compact, formValues } from '@/components/form';
import { Loading, PageHeader } from '@/components/page';
import { Onboarding } from '@/components/onboarding';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage, upload } from '@/lib/api';
import { imageSrc } from '@/lib/links';
import { TIME_ZONES, guessTimeZone } from '@/lib/timezones';
import { CATEGORY_LABELS, STAGE_LABELS } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function ProfilePage() {
  return (
    <RequireAuth roles={['startup', 'specialist']} verified>
      {(user) => <Profile user={user} />}
    </RequireAuth>
  );
}

function Profile({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => api<StartupProfile | SpecialistProfile | null>('/profiles/me'),
  });
  // What the user already gave in their verification fills an empty profile,
  // so nobody types their company, name or links twice. It stays editable:
  // verification is private and the profile is public.
  const verification = useQuery({
    queryKey: ['verification', 'me'],
    queryFn: () => api<VerificationRequest | null>('/verification/me'),
  });
  const known = verification.data ?? null;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/profiles/me/${user.role}`, { method: 'PUT', body }),
    onSuccess: async () => {
      toast.success('Profile saved');
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Onboarding className="mb-6" />
      <PageHeader
        title="My profile"
        description="Every profile follows the same template, so startups and specialists can compare them at a glance."
      />
      {profile.isLoading || verification.isLoading ? (
        <Loading />
      ) : (
        <Card>
          <CardContent className="pt-6">
            {user.role === 'startup' ? (
              <StartupForm
                known={known}
                initial={profile.data as StartupProfile | null}
                saving={save.isPending}
                onSave={save.mutate}
              />
            ) : (
              <SpecialistForm
                known={known}
                initial={profile.data as SpecialistProfile | null}
                saving={save.isPending}
                onSave={save.mutate}
              />
            )}
          </CardContent>
        </Card>
      )}
      {user.role === 'startup' ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-lg font-semibold text-navy">
                KPI templates
              </h2>
              <p className="text-sm text-muted-foreground">
                Sets of KPIs you reuse when posting jobs.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/profile/kpi-templates">Manage KPI templates</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

interface FormProps<T> {
  initial: T | null;
  /** The user's verification request, to fill fields they already gave. */
  known: VerificationRequest | null;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}

function StartupForm({ initial, known, saving, onSave }: FormProps<StartupProfile>) {
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    onSave(compact({ ...values, languages: splitList(values.languages, /,/) }));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Company name" htmlFor="companyName" required>
        <Input
          id="companyName"
          name="companyName"
          required
          minLength={2}
          maxLength={160}
          defaultValue={initial?.companyName ?? known?.companyName ?? ''}
        />
      </Field>
      <Field label="What you do, in one sentence" htmlFor="oneLiner" required>
        <Input
          id="oneLiner"
          name="oneLiner"
          required
          minLength={10}
          maxLength={200}
          defaultValue={initial?.oneLiner}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Sector"
          htmlFor="sector"
          hint="For example Fintech or Health."
          required
        >
          <Input
            id="sector"
            name="sector"
            required
            minLength={2}
            maxLength={80}
            defaultValue={initial?.sector}
          />
        </Field>
        <Field label="Stage" htmlFor="stage" required>
          <select
            id="stage"
            name="stage"
            required
            defaultValue={initial?.stage ?? ''}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="" disabled>
              Choose a stage
            </option>
            {Object.values(StartupStage).map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="What you need help with right now" htmlFor="lookingFor" required>
        <Textarea
          id="lookingFor"
          name="lookingFor"
          required
          minLength={20}
          maxLength={1000}
          defaultValue={initial?.lookingFor}
        />
      </Field>
      <Field label="Website" htmlFor="websiteUrl">
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          pattern="https://.+"
          title="A link that starts with https://"
          placeholder="https://"
          defaultValue={initial?.websiteUrl ?? known?.websiteUrl ?? ''}
        />
      </Field>
      <LogoField initial={initial?.logoUrl} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Registered name"
          htmlFor="legalName"
          hint="If it differs from the trading name."
        >
          <Input
            id="legalName"
            name="legalName"
            maxLength={160}
            defaultValue={initial?.legalName ?? ''}
          />
        </Field>
        <Field
          label="Your role"
          htmlFor="contactRole"
          hint="Who signs the contracts, e.g. Co-founder."
        >
          <Input
            id="contactRole"
            name="contactRole"
            maxLength={80}
            defaultValue={initial?.contactRole ?? ''}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Working languages" htmlFor="languages" hint="Separated by commas.">
          <Input
            id="languages"
            name="languages"
            placeholder="Spanish, English"
            defaultValue={initial?.languages.join(', ')}
          />
        </Field>
        <Field label="Location" htmlFor="location">
          <Input
            id="location"
            name="location"
            minLength={2}
            maxLength={120}
            defaultValue={initial?.location ?? ''}
          />
        </Field>
      </div>
      <Button type="submit" size="lg" disabled={saving}>
        {saving ? 'Saving...' : 'Save profile'}
      </Button>
    </form>
  );
}

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO_BYTES = 1024 * 1024;

/**
 * The company logo, as a link or an uploaded image. Uploading fills the link
 * with the address Pocket serves it at, and typing another link replaces it
 * when the profile is saved: whichever was set last is the one shown.
 */
function LogoField({ initial }: { initial: string | null | undefined }) {
  const queryClient = useQueryClient();
  const [logoUrl, setLogoUrl] = useState(initial ?? '');
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const preview = imageSrc(logoUrl);

  async function onChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error('Upload your logo as a PNG, JPEG or WebP image');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('The file is too big. The limit is 1 MB');
      return;
    }
    setBusy('upload');
    try {
      const { logoUrl: url } = await upload<{ logoUrl: string }>(
        '/profiles/me/logo',
        'file',
        file,
        '1 MB',
      );
      setLogoUrl(url);
      toast.success('Logo uploaded');
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    if (!window.confirm('Remove your logo? Your profile shows your initial instead.')) {
      return;
    }
    setBusy('remove');
    try {
      await api('/profiles/me/logo', { method: 'DELETE' });
      setLogoUrl('');
      toast.success('Logo removed');
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Field
      label="Logo"
      htmlFor="logoUrl"
      hint="Paste a link to it, or upload a PNG, JPEG or WebP image up to 1 MB. Whichever you set last is the one shown."
    >
      <div className="flex items-start gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
          {preview && broken !== preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Your logo"
              className="size-full object-contain"
              onError={() => setBroken(preview)}
            />
          ) : (
            <span className="px-1 text-center text-xs text-muted-foreground">
              {logoUrl ? 'Cannot show it' : 'No logo'}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input
            id="logoUrl"
            name="logoUrl"
            type="url"
            pattern="https://.+"
            title="A link that starts with https://"
            placeholder="https://"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy !== null} asChild>
              <label className="cursor-pointer whitespace-nowrap">
                {busy === 'upload' ? 'Uploading...' : 'Upload image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={busy !== null}
                  onChange={(event) => void onChosen(event)}
                />
              </label>
            </Button>
            {logoUrl || initial ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void onRemove()}
              >
                {busy === 'remove' ? 'Removing...' : 'Remove logo'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Field>
  );
}

function SpecialistForm({
  initial,
  known,
  saving,
  onSave,
}: FormProps<SpecialistProfile>) {
  const [categories, setCategories] = useState<ServiceCategory[]>(
    initial?.categories ?? [],
  );
  const [cvUrl, setCvUrl] = useState(initial?.cvUrl ?? '');
  const [uploadingCv, setUploadingCv] = useState(false);
  // A saved value that is not in the list stays selectable.
  const zones =
    initial?.timezone && !TIME_ZONES.includes(initial.timezone)
      ? [initial.timezone, ...TIME_ZONES]
      : TIME_ZONES;

  async function onCvChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Upload your CV as a PDF');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('The file is too big. The limit is 4 MB');
      return;
    }
    setUploadingCv(true);
    try {
      const { cvUrl: url } = await upload<{ cvUrl: string }>(
        '/profiles/me/cv',
        'file',
        file,
      );
      setCvUrl(url);
      toast.success('CV uploaded');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploadingCv(false);
    }
  }

  function toggle(category: ServiceCategory) {
    setCategories((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category],
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (categories.length === 0) {
      toast.error('Pick at least one category');
      return;
    }
    const values = formValues(event.currentTarget);
    if (!values.linkedinUrl && !values.portfolioUrl && !values.cvUrl) {
      toast.error('Add your LinkedIn, your portfolio or your CV, at least one');
      return;
    }
    const problem = specialistListProblem(values);
    if (problem) {
      toast.error(problem);
      return;
    }
    onSave(
      compact({
        ...values,
        categories,
        skills: splitList(values.skills, /,/),
        tools: splitList(values.tools, /,/),
        languages: splitList(values.languages, /,/),
        caseStudies: parseCaseStudies(values.caseStudies),
        hourlyRate: values.hourlyRate ? Number(values.hourlyRate) : undefined,
        minProjectBudget: values.minProjectBudget
          ? Number(values.minProjectBudget)
          : undefined,
        yearsExperience: values.yearsExperience
          ? Number(values.yearsExperience)
          : undefined,
        weeklyHours: values.weeklyHours ? Number(values.weeklyHours) : undefined,
      }),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Name" htmlFor="displayName" required>
        <Input
          id="displayName"
          name="displayName"
          required
          minLength={2}
          maxLength={120}
          defaultValue={initial?.displayName ?? known?.fullName ?? ''}
        />
      </Field>
      <Field
        label="Headline"
        htmlFor="headline"
        hint='For example "B2B SaaS outbound specialist".'
        required
      >
        <Input
          id="headline"
          name="headline"
          required
          minLength={10}
          maxLength={160}
          defaultValue={initial?.headline}
        />
      </Field>
      <Field label="About you" htmlFor="bio" hint="50 to 2000 characters." required>
        <Textarea
          id="bio"
          name="bio"
          required
          minLength={50}
          maxLength={2000}
          rows={5}
          defaultValue={initial?.bio}
        />
      </Field>
      <Field label="Categories" htmlFor="categories" required>
        <div id="categories" className="flex flex-wrap gap-2">
          {Object.values(ServiceCategory).map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => toggle(category)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition',
                categories.includes(category)
                  ? 'border-navy bg-navy text-off-white'
                  : 'border-border bg-background text-navy hover:border-celeste',
              )}
            >
              {CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Skills" htmlFor="skills" hint="Separated by commas, up to 20.">
        <Input id="skills" name="skills" defaultValue={initial?.skills.join(', ')} />
      </Field>
      <Field
        label="Tools"
        htmlFor="tools"
        hint="Separated by commas, e.g. Meta Ads, GA4, HubSpot."
      >
        <Input id="tools" name="tools" defaultValue={initial?.tools.join(', ')} />
      </Field>
      <Field
        label="Past work with its result"
        htmlFor="caseStudies"
        hint="One per line, as: link | what it achieved. The result is what a startup reads first."
      >
        <Textarea
          id="caseStudies"
          name="caseStudies"
          rows={3}
          placeholder="https://example.com/campaign | +40% followers in 2 months"
          defaultValue={initial?.caseStudies
            .map((study) => `${study.url} | ${study.result}`)
            .join('\n')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Years of experience" htmlFor="yearsExperience">
          <Input
            id="yearsExperience"
            name="yearsExperience"
            type="number"
            min={0}
            max={60}
            defaultValue={initial?.yearsExperience ?? ''}
          />
        </Field>
        <Field label="Hours a week" htmlFor="weeklyHours" hint="What you can take on.">
          <Input
            id="weeklyHours"
            name="weeklyHours"
            type="number"
            min={1}
            max={80}
            defaultValue={initial?.weeklyHours ?? ''}
          />
        </Field>
        <Field label="Time zone" htmlFor="timezone">
          <select
            id="timezone"
            name="timezone"
            defaultValue={initial?.timezone ?? guessTimeZone() ?? ''}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">Choose one</option>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Languages"
        htmlFor="languages"
        hint="Separated by commas. Startups in other countries look at this."
      >
        <Input
          id="languages"
          name="languages"
          placeholder="Spanish, English"
          defaultValue={initial?.languages.join(', ')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hourly rate (USDC)" htmlFor="hourlyRate">
          <Input
            id="hourlyRate"
            name="hourlyRate"
            type="number"
            min={0}
            step="any"
            defaultValue={initial?.hourlyRate ?? ''}
          />
        </Field>
        <Field label="Smallest project (USDC)" htmlFor="minProjectBudget">
          <Input
            id="minProjectBudget"
            name="minProjectBudget"
            type="number"
            min={0}
            step="any"
            defaultValue={initial?.minProjectBudget ?? ''}
          />
        </Field>
      </div>
      <Field label="Portfolio" htmlFor="portfolioUrl">
        <Input
          id="portfolioUrl"
          name="portfolioUrl"
          type="url"
          pattern="https://.+"
          title="A link that starts with https://"
          placeholder="https://"
          defaultValue={initial?.portfolioUrl ?? known?.websiteUrl ?? ''}
        />
      </Field>
      <Field label="LinkedIn" htmlFor="linkedinUrl">
        <Input
          id="linkedinUrl"
          name="linkedinUrl"
          type="url"
          pattern="https://.+"
          title="A link that starts with https://"
          placeholder="https://"
          defaultValue={initial?.linkedinUrl ?? known?.linkedinUrl ?? ''}
        />
      </Field>
      <Field
        label="CV"
        htmlFor="cvUrl"
        hint="Upload it as a PDF (up to 4 MB), or paste a link to it."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="cvUrl"
            name="cvUrl"
            type="url"
            pattern="https://.+"
            title="A link that starts with https://"
            placeholder="https://"
            value={cvUrl}
            onChange={(event) => setCvUrl(event.target.value)}
          />
          <Button type="button" variant="outline" disabled={uploadingCv} asChild>
            <label className="cursor-pointer whitespace-nowrap">
              {uploadingCv ? 'Uploading...' : 'Upload PDF'}
              <input
                type="file"
                accept="application/pdf"
                className="sr-only"
                disabled={uploadingCv}
                onChange={(event) => void onCvChosen(event)}
              />
            </label>
          </Button>
        </div>
      </Field>
      <Field label="Location" htmlFor="location">
        <Input
          id="location"
          name="location"
          minLength={2}
          maxLength={120}
          defaultValue={initial?.location ?? ''}
        />
      </Field>
      <Button type="submit" size="lg" disabled={saving}>
        {saving ? 'Saving...' : 'Save profile'}
      </Button>
    </form>
  );
}

function splitList(value: string | undefined, separator: RegExp): string[] {
  return (value ?? '')
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** One line per piece of work: `link | what it achieved`. */
function parseCaseStudies(value: string | undefined): CaseStudy[] {
  return splitList(value, /\n/).map((line) => {
    const [url = '', ...rest] = line.split('|');
    return { url: url.trim(), result: rest.join('|').trim() };
  });
}

/**
 * What the API would refuse in the specialist's lists, said the way the form
 * asks for it, or null when everything fits.
 */
function specialistListProblem(values: Record<string, string>): string | null {
  const lists: [string, string[], number, number][] = [
    ['skills', splitList(values.skills, /,/), 20, 60],
    ['tools', splitList(values.tools, /,/), 20, 60],
    ['languages', splitList(values.languages, /,/), 10, 40],
  ];
  for (const [name, items, most, longest] of lists) {
    if (items.length > most) return `Up to ${most} ${name}, separated by commas`;
    const long = items.find((item) => item.length > longest);
    if (long)
      return `"${long.slice(0, 30)}..." is too long: ${name} take ${longest} characters each`;
  }
  const studies = parseCaseStudies(values.caseStudies);
  if (studies.length > 10) return 'Up to 10 pieces of past work';
  const bad = studies.find(
    (study) =>
      !/^https:\/\/\S+\.\S+/.test(study.url) ||
      study.result.length < 3 ||
      study.result.length > 160,
  );
  if (bad) {
    return `Past work "${bad.url.slice(0, 40)}": write it as https://link | what it achieved (3 to 160 characters)`;
  }
  return null;
}

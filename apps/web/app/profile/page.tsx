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
import { useConfirm } from '@/components/confirm-dialog';
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
      toast.success('Perfil guardado');
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Onboarding className="mb-6" />
      <PageHeader
        title="Mi perfil"
        description="Todos los perfiles siguen la misma estructura, así startups y expertos pueden compararlos de un vistazo."
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
                Plantillas de KPI
              </h2>
              <p className="text-sm text-muted-foreground">
                Conjuntos de KPIs que reutilizas al publicar trabajos.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/profile/kpi-templates">Administrar plantillas de KPI</Link>
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
      <Field label="Nombre de la empresa" htmlFor="companyName" required>
        <Input
          id="companyName"
          name="companyName"
          required
          minLength={2}
          maxLength={160}
          defaultValue={initial?.companyName ?? known?.companyName ?? ''}
        />
      </Field>
      <Field label="Qué hace tu startup, en una frase" htmlFor="oneLiner" required>
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
          hint="Por ejemplo Fintech o Salud."
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
        <Field label="Etapa" htmlFor="stage" required>
          <select
            id="stage"
            name="stage"
            required
            defaultValue={initial?.stage ?? ''}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="" disabled>
              Elige una etapa
            </option>
            {Object.values(StartupStage).map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="En qué necesitas ayuda ahora" htmlFor="lookingFor" required>
        <Textarea
          id="lookingFor"
          name="lookingFor"
          required
          minLength={20}
          maxLength={1000}
          defaultValue={initial?.lookingFor}
        />
      </Field>
      <Field label="Sitio web" htmlFor="websiteUrl">
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          pattern="https://.+"
          title="Un enlace que empiece con https://"
          placeholder="https://"
          defaultValue={initial?.websiteUrl ?? known?.websiteUrl ?? ''}
        />
      </Field>
      <LogoField initial={initial?.logoUrl} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Razón social"
          htmlFor="legalName"
          hint="Si es distinta del nombre comercial."
        >
          <Input
            id="legalName"
            name="legalName"
            maxLength={160}
            defaultValue={initial?.legalName ?? ''}
          />
        </Field>
        <Field
          label="Tu cargo"
          htmlFor="contactRole"
          hint="El cargo de quien firma los contratos, por ejemplo Cofundadora."
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
        <Field label="Idiomas de trabajo" htmlFor="languages" hint="Separados por comas.">
          <Input
            id="languages"
            name="languages"
            placeholder="Español, inglés"
            defaultValue={initial?.languages.join(', ')}
          />
        </Field>
        <Field label="Ubicación" htmlFor="location">
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
        {saving ? 'Guardando...' : 'Guardar perfil'}
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
  const confirm = useConfirm();
  const [logoUrl, setLogoUrl] = useState(initial ?? '');
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const preview = imageSrc(logoUrl);

  async function onChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error('Sube tu logo como imagen PNG, JPEG o WebP');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('El archivo es demasiado grande. El límite es de 1 MB');
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
      toast.success('Logo subido');
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    const confirmed = await confirm({
      title: '¿Quitar tu logo?',
      description: 'Tu perfil mostrará tu inicial en su lugar.',
      confirmText: 'Quitar',
      destructive: true,
    });
    if (!confirmed) return;
    setBusy('remove');
    try {
      await api('/profiles/me/logo', { method: 'DELETE' });
      setLogoUrl('');
      toast.success('Logo quitado');
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
      hint="Pega un enlace o sube una imagen PNG, JPEG o WebP de hasta 1 MB. Se muestra lo último que pongas."
    >
      <div className="flex items-start gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
          {preview && broken !== preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Tu logo"
              className="size-full object-contain"
              onError={() => setBroken(preview)}
            />
          ) : (
            <span className="px-1 text-center text-xs text-muted-foreground">
              {logoUrl ? 'No se puede mostrar' : 'Sin logo'}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input
            id="logoUrl"
            name="logoUrl"
            type="url"
            pattern="https://.+"
            title="Un enlace que empiece con https://"
            placeholder="https://"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy !== null} asChild>
              <label className="cursor-pointer whitespace-nowrap">
                {busy === 'upload' ? 'Subiendo...' : 'Subir imagen'}
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
                {busy === 'remove' ? 'Quitando...' : 'Quitar logo'}
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
      toast.error('Sube tu CV en PDF');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('El archivo es demasiado grande. El límite es de 4 MB');
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
      toast.success('CV subido');
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
      toast.error('Elige al menos una categoría');
      return;
    }
    const values = formValues(event.currentTarget);
    if (!values.linkedinUrl && !values.portfolioUrl && !values.cvUrl) {
      toast.error('Agrega al menos uno: tu LinkedIn, tu portafolio o tu CV');
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
      <Field label="Nombre" htmlFor="displayName" required>
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
        label="Titular"
        htmlFor="headline"
        hint='Por ejemplo "Experta en outbound para SaaS B2B".'
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
      <Field label="Sobre ti" htmlFor="bio" hint="De 50 a 2000 caracteres." required>
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
      <Field label="Categorías" htmlFor="categories" required>
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
      <Field label="Habilidades" htmlFor="skills" hint="Separadas por comas, hasta 20.">
        <Input id="skills" name="skills" defaultValue={initial?.skills.join(', ')} />
      </Field>
      <Field
        label="Herramientas"
        htmlFor="tools"
        hint="Separadas por comas, por ejemplo Meta Ads, GA4, HubSpot."
      >
        <Input id="tools" name="tools" defaultValue={initial?.tools.join(', ')} />
      </Field>
      <Field
        label="Casos de éxito con su resultado"
        htmlFor="caseStudies"
        hint="Uno por línea, así: enlace | qué logró. El resultado es lo primero que lee una startup."
      >
        <Textarea
          id="caseStudies"
          name="caseStudies"
          rows={3}
          placeholder="https://ejemplo.com/lanzamiento | +40% de seguidores en 2 meses"
          defaultValue={initial?.caseStudies
            .map((study) => `${study.url} | ${study.result}`)
            .join('\n')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Años de experiencia" htmlFor="yearsExperience">
          <Input
            id="yearsExperience"
            name="yearsExperience"
            type="number"
            min={0}
            max={60}
            defaultValue={initial?.yearsExperience ?? ''}
          />
        </Field>
        <Field
          label="Horas por semana"
          htmlFor="weeklyHours"
          hint="Las que puedes dedicar."
        >
          <Input
            id="weeklyHours"
            name="weeklyHours"
            type="number"
            min={1}
            max={80}
            defaultValue={initial?.weeklyHours ?? ''}
          />
        </Field>
        <Field label="Zona horaria" htmlFor="timezone">
          <select
            id="timezone"
            name="timezone"
            defaultValue={initial?.timezone ?? guessTimeZone() ?? ''}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">Elige una</option>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Idiomas"
        htmlFor="languages"
        hint="Separados por comas. Las startups de otros países se fijan en esto."
      >
        <Input
          id="languages"
          name="languages"
          placeholder="Español, inglés"
          defaultValue={initial?.languages.join(', ')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarifa por hora (USDC)" htmlFor="hourlyRate">
          <Input
            id="hourlyRate"
            name="hourlyRate"
            type="number"
            min={0}
            step="any"
            defaultValue={initial?.hourlyRate ?? ''}
          />
        </Field>
        <Field label="Proyecto mínimo (USDC)" htmlFor="minProjectBudget">
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
      <Field label="Portafolio" htmlFor="portfolioUrl">
        <Input
          id="portfolioUrl"
          name="portfolioUrl"
          type="url"
          pattern="https://.+"
          title="Un enlace que empiece con https://"
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
          title="Un enlace que empiece con https://"
          placeholder="https://"
          defaultValue={initial?.linkedinUrl ?? known?.linkedinUrl ?? ''}
        />
      </Field>
      <Field
        label="CV"
        htmlFor="cvUrl"
        hint="Súbelo en PDF (hasta 4 MB) o pega un enlace."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="cvUrl"
            name="cvUrl"
            type="url"
            pattern="https://.+"
            title="Un enlace que empiece con https://"
            placeholder="https://"
            value={cvUrl}
            onChange={(event) => setCvUrl(event.target.value)}
          />
          <Button type="button" variant="outline" disabled={uploadingCv} asChild>
            <label className="cursor-pointer whitespace-nowrap">
              {uploadingCv ? 'Subiendo...' : 'Subir PDF'}
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
      <Field label="Ubicación" htmlFor="location">
        <Input
          id="location"
          name="location"
          minLength={2}
          maxLength={120}
          defaultValue={initial?.location ?? ''}
        />
      </Field>
      <Button type="submit" size="lg" disabled={saving}>
        {saving ? 'Guardando...' : 'Guardar perfil'}
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
  // Each list: its name, what one item is called, the items and their limits.
  const lists: [string, string, string[], number, number][] = [
    ['habilidades', 'habilidad', splitList(values.skills, /,/), 20, 60],
    ['herramientas', 'herramienta', splitList(values.tools, /,/), 20, 60],
    ['idiomas', 'idioma', splitList(values.languages, /,/), 10, 40],
  ];
  for (const [name, one, items, most, longest] of lists) {
    if (items.length > most)
      return `Máximo ${most} ${name}. Usa una coma entre cada ${one}`;
    const long = items.find((item) => item.length > longest);
    if (long)
      return `"${long.slice(0, 30)}..." es demasiado largo: cada ${one} admite hasta ${longest} caracteres`;
  }
  const studies = parseCaseStudies(values.caseStudies);
  if (studies.length > 10) return 'Máximo 10 casos de éxito';
  const bad = studies.find(
    (study) =>
      !/^https:\/\/\S+\.\S+/.test(study.url) ||
      study.result.length < 3 ||
      study.result.length > 160,
  );
  if (bad) {
    return `Caso de éxito "${bad.url.slice(0, 40)}": escríbelo como https://enlace | qué logró (de 3 a 160 caracteres)`;
  }
  return null;
}

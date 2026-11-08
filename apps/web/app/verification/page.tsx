'use client';

import {
  isAccountActive,
  type KycSession,
  type User,
  type VerificationRequest,
} from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  IDENTITY_FOR_CONTRACT,
  accountBadgeStatus,
  activationHint,
  useKycSettings,
} from '@/components/activation';
import { useAuth } from '@/components/auth-provider';
import { Field, compact, formValues } from '@/components/form';
import { Loading, PageHeader } from '@/components/page';
import { Onboarding } from '@/components/onboarding';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useMyProfile } from '@/lib/use-my-profile';

/** Didit statuses after which the result is still on its way, or never came. */
const KYC_UNDECIDED: (string | null | undefined)[] = [
  null,
  undefined,
  '',
  'Not Started',
  'In Progress',
  'Abandoned',
  'Expired',
];

/** How many times the page asks for the result after coming back from Didit: two minutes. */
const MAX_POLLS = 24;

/** Where to go once the identity is verified, kept across the trip to Didit. */
const AFTER_IDENTITY_KEY = 'pocket.afterIdentity';

/**
 * The page that sent the person here to verify their identity (a contract
 * they are about to accept), from the link or from before Didit. Only a
 * contract of this site is accepted.
 */
function readNext(): string | null {
  if (typeof window === 'undefined') return null;
  const valid = (path: string | null) =>
    path && /^\/contracts\/[0-9a-f-]{36}$/i.test(path) ? path : null;
  const fromLink = valid(new URLSearchParams(window.location.search).get('next'));
  try {
    if (fromLink) sessionStorage.setItem(AFTER_IDENTITY_KEY, fromLink);
    return fromLink ?? valid(sessionStorage.getItem(AFTER_IDENTITY_KEY));
  } catch {
    return fromLink;
  }
}

function forgetNext(): void {
  try {
    sessionStorage.removeItem(AFTER_IDENTITY_KEY);
  } catch {
    // Storage blocked: there is nothing to forget.
  }
}

export default function VerificationPage() {
  return (
    <RequireAuth roles={['startup', 'specialist']}>
      {(user) => <Verification user={user} />}
    </RequireAuth>
  );
}

function Verification({ user }: { user: User }) {
  const { refreshUser } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const kycSettings = useKycSettings();
  const kyc = kycSettings.data?.enabled === true;
  const kycLoading = kycSettings.isLoading;
  // Back from Didit's page: Didit adds verificationSessionId to the link.
  const [returned] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('verificationSessionId'),
  );
  const [next] = useState(readNext);
  const isSpecialist = user.role === 'specialist';
  const active = isAccountActive(user);
  const latest = useQuery({
    // Keyed on the status: when a decision arrives, the request (and the
    // reason it was turned down) is loaded again.
    queryKey: ['verification', 'me', user.verificationStatus],
    queryFn: () => api<VerificationRequest | null>('/verification/me'),
    // While Didit's result is on its way after the person came back.
    refetchInterval: (query) =>
      returned &&
      user.verificationStatus === 'pending' &&
      query.state.data?.status === 'pending' &&
      KYC_UNDECIDED.includes(query.state.data.kycStatus) &&
      query.state.dataUpdateCount < MAX_POLLS
        ? 5000
        : false,
  });
  const previous = latest.data;

  const startKyc = useMutation({
    mutationFn: () =>
      api<KycSession>('/verification/kyc', { method: 'POST', body: { consent: true } }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Read the result back as soon as the person returns, without waiting for
  // Didit's webhook.
  const refresh = useMutation({
    mutationFn: () =>
      api<VerificationRequest | null>('/verification/kyc/refresh', { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['verification', 'me'] });
      await refreshUser();
    },
  });
  const { mutate: refreshNow } = refresh;
  useEffect(() => {
    if (returned && kyc && user.verificationStatus === 'pending') refreshNow();
  }, [returned, kyc, user.verificationStatus, refreshNow]);

  // A decision lands on the request first: bring the account along with it.
  const decided = previous?.status === 'approved' || previous?.status === 'rejected';
  useEffect(() => {
    if (decided && user.verificationStatus === 'pending') void refreshUser();
  }, [decided, user.verificationStatus, refreshUser]);

  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/verification', { method: 'POST', body }),
    onSuccess: async () => {
      // With the identity check on, a startup's step shows up in place of the
      // form. A specialist's account is active already: they verify their
      // identity when they accept a contract, unless they came here for that.
      if (!kyc || isSpecialist) {
        toast.success('Listo. Tu cuenta ya está activa.');
        setSubmittedHere(true);
      }
      await queryClient.invalidateQueries({ queryKey: ['verification', 'me'] });
      await refreshUser();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Just activated here: on to what comes next. Coming to this page later on,
  // the status stays on screen with a way back.
  const [submittedHere, setSubmittedHere] = useState(false);
  const profile = useMyProfile();
  // A specialist who came to verify their identity for a contract stays for it.
  const staysForIdentity = Boolean(next) && user.verificationStatus === 'pending';
  const justActivated =
    !profile.isLoading &&
    ((returned && user.verificationStatus === 'approved') ||
      (submittedHere && active && !staysForIdentity));
  const hasProfile = Boolean(profile.data);
  useEffect(() => {
    if (!justActivated) return;
    if (returned) {
      toast.success(
        isSpecialist
          ? 'Tu identidad está verificada.'
          : 'Tu identidad está verificada. Tu cuenta ya está activa.',
      );
    }
    // Back to the contract that asked for the check, when one did.
    const to = returned && next ? next : hasProfile ? '/' : '/profile';
    forgetNext();
    router.replace(to);
  }, [justActivated, returned, next, isSpecialist, hasProfile, router]);

  const canSubmit =
    user.verificationStatus === 'not_submitted' ||
    user.verificationStatus === 'rejected' ||
    // Waiting for an identity check that is no longer set up: the form approves.
    (user.verificationStatus === 'pending' && !kyc && !kycLoading);
  const isStartup = user.role === 'startup';
  const kycStatus = previous?.status === 'pending' ? previous.kycStatus : null;
  const inReview = kycStatus === 'In Review';
  // Read on every render, and each poll renders: the last one turns this off.
  const polls =
    queryClient.getQueryState(['verification', 'me', user.verificationStatus])
      ?.dataUpdateCount ?? 0;
  const waitingForResult =
    returned &&
    polls < MAX_POLLS &&
    (refresh.isPending || kycStatus === 'In Progress' || kycStatus === 'Not Started');
  const pendingCheck = user.verificationStatus === 'pending' && kyc;
  const turnedDown =
    user.verificationStatus === 'rejected' && previous?.status === 'rejected'
      ? previous.reviewNote
      : null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    submit.mutate(compact({ ...values, country: values.country?.toUpperCase() }));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Onboarding className="mb-6" />
      <PageHeader title={pageTitle()} description={pageDescription()} />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Estado</CardTitle>
          <StatusBadge feminine status={accountBadgeStatus(user)} />
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>{statusText()}</p>
          {user.verificationStatus === 'approved' && next ? (
            <Button asChild className="mt-4">
              <Link href={next} onClick={forgetNext}>
                Volver al contrato
              </Link>
            </Button>
          ) : active && !staysForIdentity ? (
            <Button asChild className="mt-4">
              <Link href={hasProfile ? '/' : '/profile'}>
                {hasProfile ? 'Ir a mi inicio' : 'Crear mi perfil'}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {turnedDown ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>No pudimos activar tu cuenta</AlertTitle>
          <AlertDescription>{turnedDown}</AlertDescription>
        </Alert>
      ) : null}

      {pendingCheck && !inReview && !waitingForResult ? (
        <IdentityCheck
          started={kycStatus === 'In Progress'}
          forContract={isSpecialist}
          busy={startKyc.isPending}
          onStart={() => startKyc.mutate()}
        />
      ) : null}

      {latest.isLoading ? (
        <Loading />
      ) : canSubmit ? (
        <Card>
          <CardHeader>
            <CardTitle>Tus datos</CardTitle>
            <CardDescription>
              Solo el equipo de Pocket ve esto. Tu correo de contacto se comparte con la
              otra parte cuando firmen un contrato.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Nombre completo" htmlFor="fullName" required>
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={previous?.fullName}
                />
              </Field>
              <Field label="Correo de contacto" htmlFor="contactEmail" required>
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  required
                  defaultValue={previous?.contactEmail}
                />
              </Field>
              <Field
                label="País"
                htmlFor="country"
                hint="Código de dos letras, por ejemplo CR, MX o US."
                required
              >
                <Input
                  id="country"
                  name="country"
                  required
                  minLength={2}
                  maxLength={2}
                  pattern="[A-Za-z]{2}"
                  defaultValue={previous?.country}
                  className="w-24 uppercase"
                />
              </Field>
              {isStartup ? (
                <>
                  <Field label="Nombre de la empresa" htmlFor="companyName" required>
                    <Input
                      id="companyName"
                      name="companyName"
                      required
                      minLength={2}
                      maxLength={160}
                      defaultValue={previous?.companyName}
                    />
                  </Field>
                  <Field
                    label="Número de registro o identificación fiscal"
                    htmlFor="companyRegistrationId"
                    hint="Opcional. Pocket no lo verifica en ningún registro."
                  >
                    <Input
                      id="companyRegistrationId"
                      name="companyRegistrationId"
                      minLength={2}
                      maxLength={80}
                      defaultValue={previous?.companyRegistrationId}
                    />
                  </Field>
                </>
              ) : null}
              <Field
                label={isStartup ? 'LinkedIn de la empresa' : 'LinkedIn'}
                htmlFor="linkedinUrl"
              >
                <Input
                  id="linkedinUrl"
                  name="linkedinUrl"
                  type="url"
                  pattern="https://.+"
                  title="Un enlace que empiece con https://"
                  placeholder="https://"
                  defaultValue={previous?.linkedinUrl}
                />
              </Field>
              <Field
                label={isStartup ? 'Sitio web de la empresa' : 'Portafolio'}
                htmlFor="websiteUrl"
              >
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  type="url"
                  pattern="https://.+"
                  title="Un enlace que empiece con https://"
                  placeholder="https://"
                  defaultValue={previous?.websiteUrl}
                />
              </Field>
              <Button type="submit" size="lg" disabled={submit.isPending}>
                {submitLabel()}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  function pageTitle(): string {
    if (isSpecialist && kyc && user.verificationStatus === 'pending') {
      return 'Verifica tu identidad';
    }
    return kyc && !isSpecialist ? 'Activa tu cuenta' : 'Datos de tu cuenta';
  }

  function pageDescription(): string {
    if (isSpecialist && kyc) {
      return user.verificationStatus === 'pending' ||
        user.verificationStatus === 'approved'
        ? IDENTITY_FOR_CONTRACT
        : activationHint(kyc, user);
    }
    return kyc
      ? 'Completa tus datos y verifica tu identidad con tu documento y una selfie. Toma unos minutos, y después puedes usar todo el marketplace.'
      : 'Un formulario corto, sin documentos. Al enviarlo tu cuenta queda activa y puedes usar todo el marketplace.';
  }

  function statusText(): string {
    switch (user.verificationStatus) {
      case 'approved':
        return kyc
          ? 'Tu identidad está verificada y tu cuenta está activa. Puedes usar todo el marketplace.'
          : 'Tu cuenta está activa. Puedes usar todo el marketplace.';
      case 'rejected':
        return 'Revisa tus datos y vuelve a intentarlo.';
      case 'pending':
        if (!kyc) return 'Confirma tus datos abajo para activar tu cuenta.';
        if (inReview) {
          return 'Tu verificación está en revisión. Normalmente termina en menos de un día: vuelve a entrar más tarde para ver el resultado.';
        }
        if (waitingForResult) {
          return 'Estamos recibiendo el resultado de tu verificación. Toma unos segundos.';
        }
        return isSpecialist
          ? 'Tu cuenta está activa: ya puedes armar tu perfil y postularte. Para aceptar un contrato falta verificar tu identidad.'
          : 'Tus datos están listos. Falta verificar tu identidad.';
      default:
        return kyc && !isSpecialist
          ? 'Paso 1 de 2: completa tus datos abajo. Después verificas tu identidad.'
          : 'Completa el formulario de abajo para activar tu cuenta.';
    }
  }

  function submitLabel(): string {
    // A startup goes on to its identity check; a specialist is done here.
    const identityNext = kyc && !isSpecialist;
    if (submit.isPending) return identityNext ? 'Enviando...' : 'Activando...';
    return identityNext ? 'Continuar' : 'Activar mi cuenta';
  }
}

/**
 * The identity check, with the express consent biometric data needs: asked
 * apart from everything else, and never ticked in advance.
 */
function IdentityCheck({
  started,
  forContract,
  busy,
  onStart,
}: {
  started: boolean;
  /** A specialist's check, which accepting a contract needs, rather than step 2 of 2. */
  forContract: boolean;
  busy: boolean;
  onStart: () => void;
}) {
  const [consent, setConsent] = useState(false);
  return (
    <Card className="mb-6 border-celeste">
      <CardHeader>
        <CardTitle>
          {started ? 'Termina de verificar tu identidad' : 'Verifica tu identidad'}
        </CardTitle>
        <CardDescription>
          {started
            ? 'Empezaste la verificación pero no la terminaste. Puedes continuar donde la dejaste.'
            : forContract
              ? 'Lo necesitas para aceptar un contrato. Lo hace Didit, un servicio de verificación de identidad, en unos minutos.'
              : 'Paso 2 de 2. Lo hace Didit, un servicio de verificación de identidad, en unos minutos.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Ten a mano tu documento oficial vigente: INE, pasaporte o cédula.</li>
          <li>Usa un celular o una computadora con cámara, en un lugar con buena luz.</li>
          <li>
            Pocket no recibe ni guarda las fotos de tu documento ni tu selfie: solo el
            resultado.
          </li>
        </ul>
        <label className="flex items-start gap-3 text-foreground">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-navy"
          />
          <span>
            Doy mi consentimiento expreso para que Didit trate la foto de mi documento y
            mis datos biométricos (selfie y prueba de vida) para verificar mi identidad,
            como lo describe la{' '}
            <Link href="/privacy" target="_blank" className="underline">
              Política de Privacidad
            </Link>
            .
          </span>
        </label>
        <Button size="lg" disabled={!consent || busy} onClick={onStart}>
          {busy
            ? 'Abriendo...'
            : started
              ? 'Continuar la verificación'
              : 'Verificar mi identidad'}
        </Button>
      </CardContent>
    </Card>
  );
}

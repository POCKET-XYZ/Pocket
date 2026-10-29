'use client';

import type { User, VerificationRequest } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { Field, compact, formValues } from '@/components/form';
import { Loading, PageHeader } from '@/components/page';
import { Onboarding } from '@/components/onboarding';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
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

export default function VerificationPage() {
  return (
    <RequireAuth roles={['startup', 'specialist']}>
      {(user) => <Verification user={user} />}
    </RequireAuth>
  );
}

function Verification({ user }: { user: User }) {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const latest = useQuery({
    // Keyed on the status: once the account is approved, the details are
    // loaded again.
    queryKey: ['verification', 'me', user.verificationStatus],
    queryFn: () => api<VerificationRequest | null>('/verification/me'),
  });

  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/verification', { method: 'POST', body }),
    onSuccess: async () => {
      toast.success('Listo. Tu cuenta ya está activa.');
      await queryClient.invalidateQueries({ queryKey: ['verification', 'me'] });
      await refreshUser();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const canSubmit = user.verificationStatus !== 'approved';
  const isStartup = user.role === 'startup';
  const previous = latest.data;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    submit.mutate(compact({ ...values, country: values.country?.toUpperCase() }));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Onboarding className="mb-6" />
      <PageHeader
        title="Datos de tu cuenta"
        description="Un formulario corto, sin documentos. Al enviarlo tu cuenta queda activa y puedes usar todo el marketplace."
      />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Estado</CardTitle>
          <StatusBadge feminine status={user.verificationStatus} />
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {user.verificationStatus === 'approved'
            ? 'Tu cuenta está activa. Puedes usar todo el marketplace.'
            : 'Completa el formulario de abajo para activar tu cuenta.'}
        </CardContent>
      </Card>

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
                {submit.isPending ? 'Activando...' : 'Activar mi cuenta'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

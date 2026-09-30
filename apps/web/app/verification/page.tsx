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
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';

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
    queryKey: ['verification', 'me'],
    queryFn: () => api<VerificationRequest | null>('/verification/me'),
  });

  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/verification', { method: 'POST', body }),
    onSuccess: async () => {
      toast.success('Sent. A manager will review it soon.');
      await queryClient.invalidateQueries({ queryKey: ['verification', 'me'] });
      await refreshUser();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const canSubmit =
    user.verificationStatus === 'not_submitted' || user.verificationStatus === 'rejected';
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
        title="Verification"
        description="Pocket reviews every account by hand before it can use the marketplace. Links are enough; no documents needed."
      />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Status</CardTitle>
          <StatusBadge status={user.verificationStatus} />
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {user.verificationStatus === 'not_submitted' &&
            'Fill in the form below and send it for review.'}
          {user.verificationStatus === 'pending' &&
            `Sent ${dateTime(previous?.submittedAt)}. A manager will review it, oldest requests first.`}
          {user.verificationStatus === 'approved' &&
            'You are verified. You can use the whole marketplace.'}
          {user.verificationStatus === 'rejected' &&
            'Fix what the manager pointed out and send it again.'}
        </CardContent>
      </Card>

      {user.verificationStatus === 'rejected' && previous?.reviewNote ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Why it was rejected</AlertTitle>
          <AlertDescription>{previous.reviewNote}</AlertDescription>
        </Alert>
      ) : null}

      {latest.isLoading ? (
        <Loading />
      ) : canSubmit ? (
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>
              Only managers see this. Your contact email is shared with the other party
              once you sign a contract.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Full name" htmlFor="fullName" required>
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={previous?.fullName}
                />
              </Field>
              <Field label="Contact email" htmlFor="contactEmail" required>
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  required
                  defaultValue={previous?.contactEmail}
                />
              </Field>
              <Field
                label="Country"
                htmlFor="country"
                hint="Two-letter code, for example CR, MX or US."
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
                  <Field label="Company name" htmlFor="companyName" required>
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
                    label="Registration or tax id"
                    htmlFor="companyRegistrationId"
                    hint="Optional. Pocket does not check it against any registry, so it is only a hint for the manager, never a badge of trust."
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
              <Field label={isStartup ? 'Company LinkedIn' : 'LinkedIn'} htmlFor="linkedinUrl">
                <Input
                  id="linkedinUrl"
                  name="linkedinUrl"
                  type="url"
                  placeholder="https://"
                  defaultValue={previous?.linkedinUrl}
                />
              </Field>
              <Field
                label={isStartup ? 'Company website' : 'Portfolio'}
                htmlFor="websiteUrl"
              >
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  type="url"
                  placeholder="https://"
                  defaultValue={previous?.websiteUrl}
                />
              </Field>
              <Field label="Note for the manager" htmlFor="note">
                <Textarea
                  id="note"
                  name="note"
                  maxLength={1000}
                  defaultValue={previous?.note}
                />
              </Field>
              <Button type="submit" size="lg" disabled={submit.isPending}>
                {submit.isPending ? 'Sending...' : 'Send for review'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

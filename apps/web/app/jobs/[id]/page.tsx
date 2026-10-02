'use client';

import {
  POCKET_FEE_PERCENT,
  TRUSTLESS_WORK_FEE_PERCENT,
  afterFees,
  type JobListing,
  type MyApplication,
  type User,
} from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { Avatar } from '@/components/avatar';
import { KpiList } from '@/components/contract/kpi-report';
import { Field, formValues } from '@/components/form';
import { Detail, ErrorAlert, Loading, PageHeader } from '@/components/page';
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
import { useMyProfile } from '@/lib/use-my-profile';
import { CATEGORY_LABELS, date, isoInDays, usdc } from '@/lib/format';

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const job = useQuery({
    queryKey: ['jobs', id],
    queryFn: () => api<JobListing>(`/jobs/${id}`),
  });

  if (job.isLoading) return <Loading />;
  if (job.error || !job.data)
    return <ErrorAlert error={job.error} title="Job not found" />;
  const data = job.data;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <PageHeader
          title={data.title}
          description={
            data.startup ? (
              <Link
                href={`/startups/${data.startupId}`}
                className="inline-flex items-center gap-2 underline"
              >
                <Avatar
                  name={data.startup.companyName}
                  url={data.startup.logoUrl}
                  size={24}
                />
                {data.startup.companyName}
              </Link>
            ) : (
              'A verified startup'
            )
          }
        />
        <Card>
          <CardContent className="space-y-6 pt-6">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Detail label="Budget">{usdc(data.budget)}</Detail>
              <Detail label="Deadline">{date(data.deadline)}</Detail>
              <Detail label="Category">{CATEGORY_LABELS[data.category]}</Detail>
              <Detail label="Status">
                <StatusBadge status={data.status} />
              </Detail>
            </dl>
            <section>
              <h2 className="text-lg font-semibold text-navy">Scope</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                {data.description}
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-navy">Expected deliverables</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                {data.deliverables}
              </p>
            </section>
            {data.channel || data.contentLanguage || data.startupProvides ? (
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {data.channel ? <Detail label="Channel">{data.channel}</Detail> : null}
                {data.contentLanguage ? (
                  <Detail label="Content language">{data.contentLanguage}</Detail>
                ) : null}
                <Detail label="Rounds of changes">{data.revisionRounds}</Detail>
                {data.startupProvides ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Detail label="The startup provides">{data.startupProvides}</Detail>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {data.kpis.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold text-navy">
                  How the work is measured
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Every delivery reports a result for each of these.
                </p>
                <KpiList kpis={data.kpis} />
              </section>
            ) : null}
            {data.milestones.length > 0 ? (
              <section>
                <h2 className="text-lg font-semibold text-navy">Payment plan</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Each one is paid when the startup approves it.
                </p>
                <ol className="mt-3 space-y-3">
                  {data.milestones.map((milestone) => (
                    <li
                      key={milestone.id}
                      className="rounded-xl border border-border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-navy">{milestone.title}</p>
                        <p className="text-muted-foreground">
                          {usdc(milestone.amount)} · due {date(milestone.dueDate)}
                        </p>
                      </div>
                      <p className="mt-1 whitespace-pre-line">{milestone.description}</p>
                      <p className="mt-2 whitespace-pre-line text-muted-foreground">
                        <span className="font-medium text-navy">To be approved: </span>
                        {milestone.acceptanceCriteria}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        {!user ? (
          <Card>
            <CardHeader>
              <CardTitle>Want this job?</CardTitle>
              <CardDescription>
                Connect your wallet as a specialist to apply.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/login">Sign in to apply</Link>
              </Button>
            </CardContent>
          </Card>
        ) : user.role === 'specialist' ? (
          <ApplyCard job={data} user={user} />
        ) : user.id === data.startupId ? (
          <OwnerCard job={data} />
        ) : null}
      </aside>
    </div>
  );
}

function ApplyCard({ job, user }: { job: JobListing; user: User }) {
  const [price, setPrice] = useState(String(Number(job.budget)));
  const [days, setDays] = useState('');
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ['applications', 'mine'],
    queryFn: () => api<MyApplication[]>('/applications/mine'),
  });
  const existing = mine.data?.find((application) => application.jobId === job.id);
  const profile = useMyProfile();

  const apply = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/jobs/${job.id}/applications`, { method: 'POST', body }),
    onSuccess: async () => {
      toast.success('Application sent');
      await queryClient.invalidateQueries({ queryKey: ['applications', 'mine'] });
      await queryClient.invalidateQueries({ queryKey: ['jobs', job.id] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    apply.mutate({
      approach: values.approach,
      ...(values.similarWorkUrl ? { similarWorkUrl: values.similarWorkUrl } : {}),
      ...(values.needsFromStartup ? { needsFromStartup: values.needsFromStartup } : {}),
      price: Number(values.price),
      estimatedDays: Number(values.estimatedDays),
    });
  }

  if (existing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You applied</CardTitle>
          <CardDescription>
            {usdc(existing.price)} in {existing.estimatedDays} days
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <StatusBadge status={existing.status} />
          <Button asChild variant="link">
            <Link href="/applications">My applications</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (job.status !== 'open') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No longer taking applications</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (user.verificationStatus !== 'approved') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Get verified to apply</CardTitle>
          <CardDescription>
            A Pocket manager reviews every specialist first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/verification">Go to verification</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // The startup reads the profile to choose: without one there is nothing to send.
  if (profile.isLoading) return null;
  if (!profile.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Create your profile to apply</CardTitle>
          <CardDescription>
            Startups read it to choose who to hire. It takes a few minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/profile">Create profile</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply</CardTitle>
        <CardDescription>
          You can offer a different price than the budget.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="How would you do it?"
            htmlFor="approach"
            hint="The steps you would follow for this job, not your life story."
            required
          >
            <Textarea
              id="approach"
              name="approach"
              required
              minLength={50}
              maxLength={5000}
              rows={5}
            />
          </Field>
          <Field
            label="A similar piece of work"
            htmlFor="similarWorkUrl"
            hint="A link to something close to this job."
          >
            <Input
              id="similarWorkUrl"
              name="similarWorkUrl"
              type="url"
              pattern="https://.+"
              title="A link that starts with https://"
              placeholder="https://"
            />
          </Field>
          <Field
            label="What do you need from them?"
            htmlFor="needsFromStartup"
            hint="Brand, access, a script, anything you need to start."
          >
            <Textarea
              id="needsFromStartup"
              name="needsFromStartup"
              maxLength={2000}
              rows={2}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (USDC)" htmlFor="price" required>
              <Input
                id="price"
                name="price"
                type="number"
                required
                min={1}
                step="any"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
            <Field
              label="Days"
              htmlFor="estimatedDays"
              hint="Counted from the day the startup funds the escrow."
              required
            >
              <Input
                id="estimatedDays"
                name="estimatedDays"
                type="number"
                required
                min={1}
                max={365}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </Field>
          </div>

          <PriceNote price={price} budget={job.budget} />
          <DeadlineNote days={days} deadline={job.deadline} />

          <Button type="submit" className="w-full" disabled={apply.isPending}>
            {apply.isPending ? 'Sending...' : 'Send application'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** How the offer compares to the budget, and what is left after the fees. */
function PriceNote({ price, budget }: { price: string; budget: string }) {
  const offered = Number(price);
  const posted = Number(budget);
  if (!Number.isFinite(offered) || offered <= 0) return null;
  const difference = offered - posted;
  const net = usdc(afterFees(offered));
  const fees = `Trustless Work keeps ${TRUSTLESS_WORK_FEE_PERCENT}% and Pocket ${POCKET_FEE_PERCENT}%, so you receive ${net}.`;
  return (
    <p className="text-sm text-muted-foreground">
      {difference === 0
        ? `Same as the budget. ${fees}`
        : `${difference > 0 ? '+' : '-'}${usdc(Math.abs(difference))} ${
            difference > 0 ? 'over' : 'under'
          } the ${usdc(budget)} budget. ${fees}`}
    </p>
  );
}

/** Warns when the work would end after the day the startup needs it. */
function DeadlineNote({ days, deadline }: { days: string; deadline: string }) {
  const estimate = Number(days);
  if (!Number.isFinite(estimate) || estimate <= 0) return null;
  const endsOn = isoInDays(estimate);
  if (endsOn <= deadline.slice(0, 10)) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>That is past the deadline</AlertTitle>
      <AlertDescription>
        Starting today, {estimate} days end on {date(endsOn)}, after the {date(deadline)}{' '}
        the startup asked for. You can still apply, but say why in your proposal.
      </AlertDescription>
    </Alert>
  );
}

function OwnerCard({ job }: { job: JobListing }) {
  const queryClient = useQueryClient();
  const close = useMutation({
    mutationFn: () => api(`/jobs/${job.id}/close`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Job closed');
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your job</CardTitle>
        <CardDescription>{job.applicationCount} applications so far.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button asChild className="w-full">
          <Link href={`/jobs/${job.id}/applicants`}>Review applicants</Link>
        </Button>
        {job.status === 'open' ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={close.isPending}
            onClick={() => {
              if (
                window.confirm(
                  'Close this job? Applications still waiting will be turned down.',
                )
              )
                close.mutate();
            }}
          >
            Close job
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

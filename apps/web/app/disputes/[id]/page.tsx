'use client';

import { DisputeOutcome, type DisputeDetail, type User } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, compact, formValues } from '@/components/form';
import { Detail, ErrorAlert, Loading, PageHeader } from '@/components/page';
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
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { dateTime, usdc } from '@/lib/format';
import { cn } from '@/lib/utils';
import { linkHost, safeHref } from '@/lib/links';

const OUTCOMES: { value: DisputeOutcome; label: string }[] = [
  { value: DisputeOutcome.PaySpecialist, label: 'Pay the specialist' },
  { value: DisputeOutcome.RefundStartup, label: 'Refund the startup' },
  { value: DisputeOutcome.Split, label: 'Split it' },
];

export default function DisputePage() {
  return <RequireAuth>{(user) => <DisputeView user={user} />}</RequireAuth>;
}

function DisputeView({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>();
  const dispute = useQuery({
    queryKey: ['disputes', id],
    queryFn: () => api<DisputeDetail>(`/disputes/${id}`),
  });

  if (dispute.isLoading) return <Loading />;
  if (dispute.error || !dispute.data)
    return <ErrorAlert error={dispute.error} title="Dispute not found" />;
  const data = dispute.data;
  const { contract } = data.milestone;
  const who = (authorId: string) =>
    authorId === contract.startupId
      ? 'Startup'
      : authorId === contract.specialistId
        ? 'Specialist'
        : 'Manager';

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <PageHeader
          title={`Dispute: ${data.milestone.title}`}
          description={
            <>
              Opened by the {who(data.openedById).toLowerCase()} on{' '}
              {dateTime(data.createdAt)}.{' '}
              <Link href={`/contracts/${contract.id}`} className="underline">
                Go to the contract
              </Link>
            </>
          }
          actions={<StatusBadge status={data.status} className="px-3 py-1 text-sm" />}
        />

        <Card>
          <CardContent className="space-y-4 pt-6">
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Milestone amount">{usdc(data.milestone.amount)}</Detail>
              <Detail label="Milestone status">
                <StatusBadge status={data.milestone.status} />
              </Detail>
            </dl>
            <Detail label="Reason">
              <p className="whitespace-pre-line">{data.reason}</p>
            </Detail>
            {data.status === 'resolved' ? (
              <div className="rounded-xl bg-muted p-3 text-sm">
                <p className="font-medium text-navy">
                  Decision: {usdc(data.specialistAmount)} to the specialist,{' '}
                  {usdc(data.startupAmount)} to the startup.
                </p>
                {data.resolutionNote ? (
                  <p className="mt-1">{data.resolutionNote}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Resolved {dateTime(data.resolvedAt)}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {data.milestone.deliverables.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Deliveries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.milestone.deliverables.map((deliverable) => (
                <div key={deliverable.id}>
                  <span className="font-medium text-navy">
                    Version {deliverable.version}:{' '}
                  </span>
                  <a
                    href={safeHref(deliverable.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all underline"
                  >
                    {deliverable.url}
                  </a>{' '}
                  <span className="text-xs text-muted-foreground">
                    ({linkHost(deliverable.url)})
                  </span>
                  {deliverable.feedback ? (
                    <p className="text-muted-foreground">
                      Changes asked: {deliverable.feedback}
                    </p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
            <CardDescription>Links and comments from both sides.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">No evidence yet.</p>
            ) : null}
            {data.evidence.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {who(item.authorId)} · {dateTime(item.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line">{item.comment}</p>
                {item.url ? (
                  <a
                    href={safeHref(item.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 break-all underline"
                  >
                    {item.url} <ExternalLinkIcon className="size-3 shrink-0" />
                    <span className="text-xs text-muted-foreground no-underline">
                      ({linkHost(item.url)})
                    </span>
                  </a>
                ) : null}
              </div>
            ))}
            {data.status === 'open' ? <EvidenceForm disputeId={data.id} /> : null}
          </CardContent>
        </Card>
      </div>

      <aside>
        {user.role === 'manager' && data.status === 'open' ? (
          <ResolveCard dispute={data} />
        ) : null}
      </aside>
    </div>
  );
}

function EvidenceForm({ disputeId }: { disputeId: string }) {
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/disputes/${disputeId}/evidence`, { method: 'POST', body }),
    onSuccess: async () => {
      toast.success('Evidence added');
      await queryClient.invalidateQueries({ queryKey: ['disputes', disputeId] });
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      // Most often the dispute was resolved meanwhile: show it as it is now.
      await queryClient.invalidateQueries({ queryKey: ['disputes', disputeId] });
    },
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    add.mutate(compact(formValues(form)), { onSuccess: () => form.reset() });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-border pt-4">
      <Textarea
        name="comment"
        required
        minLength={2}
        maxLength={2000}
        placeholder="Add a comment"
      />
      <Input name="url" type="url" placeholder="Link (optional)" />
      <Button type="submit" size="sm" disabled={add.isPending}>
        Add evidence
      </Button>
    </form>
  );
}

function ResolveCard({ dispute }: { dispute: DisputeDetail }) {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<DisputeOutcome>(DisputeOutcome.PaySpecialist);
  const resolve = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/manager/disputes/${dispute.id}/resolve`, { method: 'POST', body }),
    onSuccess: async () => {
      toast.success('Resolved. The escrow paid out the decision.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['disputes'] }),
        queryClient.invalidateQueries({ queryKey: ['contracts'] }),
      ]);
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      await queryClient.invalidateQueries({ queryKey: ['disputes'] });
    },
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const decision = OUTCOMES.find((option) => option.value === outcome)?.label;
    if (!window.confirm(`${decision}? This executes on the escrow and cannot be undone.`))
      return;
    resolve.mutate({
      outcome,
      note: values.note,
      ...(outcome === DisputeOutcome.Split
        ? { specialistAmount: Number(values.specialistAmount) }
        : {}),
    });
  }

  return (
    <Card className="border-navy">
      <CardHeader>
        <CardTitle>Decide</CardTitle>
        <CardDescription>
          Pocket executes the decision on the escrow. It can only pay the two parties.
          Trustless Work keeps 0.3% of what is paid out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-2">
            {OUTCOMES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setOutcome(option.value)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition',
                  outcome === option.value
                    ? 'border-navy bg-navy text-off-white'
                    : 'border-border hover:border-celeste',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {outcome === DisputeOutcome.Split ? (
            <Field
              label="USDC for the specialist"
              htmlFor="specialistAmount"
              hint={`More than 0 and less than ${usdc(dispute.milestone.amount)}. The startup gets the rest.`}
              required
            >
              <Input
                id="specialistAmount"
                name="specialistAmount"
                type="number"
                required
                min={0}
                max={Number(dispute.milestone.amount)}
                step="any"
              />
            </Field>
          ) : null}
          <Field label="Note for both parties" htmlFor="note" required>
            <Textarea id="note" name="note" required minLength={10} maxLength={2000} />
          </Field>
          <Button type="submit" className="w-full" disabled={resolve.isPending}>
            {resolve.isPending ? 'Executing on the escrow...' : 'Resolve dispute'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

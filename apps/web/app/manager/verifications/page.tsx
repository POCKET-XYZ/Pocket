'use client';

import type { UserRole, VerificationRequest } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Detail, EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { dateTime, shortAddress } from '@/lib/format';
import { linkHost, safeHref } from '@/lib/links';

type QueueStatus = 'pending' | 'approved' | 'rejected';

interface QueueItem extends VerificationRequest {
  user: { id: string; role: UserRole; stellarAddress: string; createdAt: string };
}

export default function VerificationsPage() {
  return <RequireAuth roles={['manager']}>{() => <Queue />}</RequireAuth>;
}

function Queue() {
  const [status, setStatus] = useState<QueueStatus>('pending');
  const queue = useQuery({
    queryKey: ['manager', 'verifications', status],
    queryFn: () => api<QueueItem[]>(`/manager/verifications?status=${status}`),
  });

  return (
    <div>
      <PageHeader
        title="Verifications"
        description="Oldest first. Nobody can use the marketplace until you approve them."
      />
      <Tabs
        value={status}
        onValueChange={(value) => setStatus(value as QueueStatus)}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>
      {queue.isLoading ? (
        <Loading />
      ) : queue.error ? (
        <ErrorAlert error={queue.error} />
      ) : queue.data && queue.data.length > 0 ? (
        <div className="space-y-4">
          {queue.data.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            status === 'pending' ? 'Nothing waiting for review' : `No ${status} requests`
          }
        />
      )}
    </div>
  );
}

function RequestCard({ request }: { request: QueueItem }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const review = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      api(`/manager/verifications/${request.id}/${decision}`, {
        method: 'POST',
        // Only a rejection carries a note: it is what the user reads to fix
        // their request. Nothing shows a note on an approval.
        body: decision === 'reject' ? { note: note.trim() } : {},
      }),
    onSuccess: async (_, decision) => {
      toast.success(decision === 'approve' ? 'Approved' : 'Rejected');
      await queryClient.invalidateQueries({ queryKey: ['manager', 'verifications'] });
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      // Another manager may have reviewed it: show the queue as it is now.
      await queryClient.invalidateQueries({ queryKey: ['manager', 'verifications'] });
    },
  });

  const links = [
    request.linkedinUrl ? { label: 'LinkedIn', url: request.linkedinUrl } : null,
    request.websiteUrl ? { label: 'Website', url: request.websiteUrl } : null,
  ].filter((link): link is { label: string; url: string } => link !== null);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-heading text-lg font-semibold text-navy">
              {request.companyName ?? request.fullName}
              <span className="ml-2 text-sm font-normal capitalize text-muted-foreground">
                {request.user.role}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Sent {dateTime(request.submittedAt)} · wallet{' '}
              {shortAddress(request.user.stellarAddress)}
            </p>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Full name">{request.fullName}</Detail>
          <Detail label="Email">{request.contactEmail}</Detail>
          <Detail label="Country">{request.country}</Detail>
          {request.companyRegistrationId ? (
            <Detail label="Registration id">{request.companyRegistrationId}</Detail>
          ) : null}
        </dl>
        {links.length > 0 ? (
          <div className="flex flex-wrap gap-3 text-sm">
            {links.map((link) => (
              <a
                key={link.url}
                href={safeHref(link.url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                {link.label} ({linkHost(link.url)}) <ExternalLinkIcon className="size-3" />
              </a>
            ))}
          </div>
        ) : null}
        {request.note ? <Detail label="Their note">{request.note}</Detail> : null}
        {request.reviewNote ? (
          <Detail label="Review note">{request.reviewNote}</Detail>
        ) : null}

        {request.status === 'pending' ? (
          <div className="space-y-2 border-t border-border pt-4">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-label="Reason for rejecting"
              placeholder="Only to reject: tell them what to fix. They will read this."
              maxLength={1000}
            />
            <div className="flex gap-2">
              <Button
                disabled={review.isPending}
                onClick={() => review.mutate('approve')}
              >
                Approve
              </Button>
              <Button
                variant="destructive"
                disabled={review.isPending || !note.trim()}
                onClick={() => review.mutate('reject')}
              >
                Reject
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

'use client';

import type {
  ContractDetail,
  Deliverable,
  DeliveryInput,
  Dispute,
  JobKpi,
  User,
} from '@pocket/shared';
import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formValues } from '@/components/form';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AttachFileButton,
  ATTACHMENT_TYPES,
  KpiReport,
  attachmentProblem,
  kpiTarget,
} from '@/components/contract/kpi-report';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage, upload } from '@/lib/api';
import { toast } from 'sonner';
import { date, dateTime, usdc } from '@/lib/format';
import { useContractAction } from '@/lib/use-contract-action';
import { useSigner } from '@/components/use-signer';
import { prepareSignSubmit, type PreparedTransaction } from '@/lib/wallet';
import { linkHost, safeHref } from '@/lib/links';

type MilestoneWithHistory = ContractDetail['milestones'][number];

/** A milestone can be disputed while the work is under way or delivered. */
const DISPUTABLE = ['pending', 'delivered', 'changes_requested'];

export function MilestoneCard({
  contract,
  milestone,
  user,
}: {
  contract: ContractDetail;
  milestone: MilestoneWithHistory;
  user: User;
}) {
  const isStartup = user.id === contract.startupId;
  const isSpecialist = user.id === contract.specialistId;
  const isManager = user.role === 'manager';
  const roundsLeft = milestone.revisionsUsed < contract.job.revisionRounds;
  const active = contract.status === 'active';
  const lastDispute: Dispute | undefined = milestone.disputes.at(-1);
  const latest: Deliverable | undefined = milestone.deliverables.at(-1);
  const signer = useSigner();

  const approve = useContractAction(
    contract.id,
    () =>
      prepareSignSubmit(
        signer.sign,
        { kind: 'approve', escrowId: contract.escrowId },
        `/milestones/${milestone.id}/approve/prepare`,
        `/milestones/${milestone.id}/approve/submit`,
      ),
    'Approved. The payment was released to the specialist.',
  );
  const retryRelease = useContractAction(
    contract.id,
    () => api(`/milestones/${milestone.id}/release`, { method: 'POST' }),
    'Payment released',
  );

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Milestone {milestone.position + 1} · due {date(milestone.dueDate)}
            </p>
            <h3 className="mt-1 font-heading text-lg font-semibold text-navy">
              {milestone.title}
            </h3>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground/80">
              {milestone.description}
            </p>
            {milestone.acceptanceCriteria ? (
              <p className="mt-2 whitespace-pre-line rounded-lg bg-celeste-light/40 px-3 py-2 text-sm">
                <span className="font-medium text-navy">To be approved: </span>
                {milestone.acceptanceCriteria}
              </p>
            ) : null}
            {milestone.revisionsUsed > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {milestone.revisionsUsed} of {contract.job.revisionRounds} rounds of
                changes used.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="font-semibold text-navy">{usdc(milestone.amount)}</span>
            <StatusBadge status={milestone.status} />
          </div>
        </div>

        {milestone.deliverables.length > 0 ? (
          <div className="space-y-2 rounded-xl bg-muted/60 p-3">
            {milestone.deliverables
              .slice()
              .reverse()
              .map((deliverable) => (
                <div key={deliverable.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-navy">
                      Version {deliverable.version}
                    </span>
                    <a
                      href={safeHref(deliverable.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 break-all underline"
                    >
                      {deliverable.url} <ExternalLinkIcon className="size-3 shrink-0" />
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {linkHost(deliverable.url)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dateTime(deliverable.createdAt)}
                    </span>
                  </div>
                  {deliverable.note ? (
                    <p className="mt-1 text-foreground/80">{deliverable.note}</p>
                  ) : null}
                  <KpiReport kpis={contract.job.kpis} deliverable={deliverable} />
                  {deliverable.feedback ? (
                    <p className="mt-1 rounded-lg bg-yellow/25 px-2 py-1 text-navy">
                      Changes asked: {deliverable.feedback}
                    </p>
                  ) : null}
                </div>
              ))}
          </div>
        ) : null}

        {lastDispute?.status === 'resolved' ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            Resolved by a manager: {usdc(lastDispute.specialistAmount)} to the specialist
            and {usdc(lastDispute.startupAmount)} back to the startup.
            {lastDispute.resolutionNote ? ` "${lastDispute.resolutionNote}"` : ''}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {active &&
          isSpecialist &&
          (milestone.status === 'pending' || milestone.status === 'changes_requested') ? (
            <DeliverDialog
              contractId={contract.id}
              milestoneId={milestone.id}
              kpis={contract.job.kpis}
            />
          ) : null}

          {active && isSpecialist && milestone.status === 'delivered' && latest ? (
            <AttachFileButton contractId={contract.id} deliverable={latest} />
          ) : null}

          {active && isStartup && milestone.status === 'delivered' ? (
            <>
              <Button
                disabled={approve.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Approve this delivery and release ${usdc(milestone.amount)} to the specialist? Approvals cannot be undone.`,
                    )
                  )
                    approve.mutate();
                }}
              >
                {approve.isPending ? 'Waiting for your wallet...' : 'Approve and pay'}
              </Button>
              {roundsLeft ? (
                <RequestChangesDialog
                  contractId={contract.id}
                  milestoneId={milestone.id}
                />
              ) : (
                <p className="self-center text-sm text-muted-foreground">
                  No rounds of changes left: approve it, or open a dispute.
                </p>
              )}
            </>
          ) : null}

          {/* Approved but not paid yet: the release failed or is still confirming. */}
          {active && isSpecialist && milestone.status === 'approved' ? (
            <p className="text-sm text-muted-foreground">
              Approved. The payment is being released to your wallet; it shows up here as
              paid once the network confirms it.
            </p>
          ) : null}

          {active && (isStartup || isManager) && milestone.status === 'approved' ? (
            <Button
              variant="outline"
              disabled={retryRelease.isPending}
              onClick={() => retryRelease.mutate()}
            >
              {retryRelease.isPending ? 'Releasing...' : 'Retry the payment'}
            </Button>
          ) : null}

          {active &&
          (isStartup || isSpecialist) &&
          DISPUTABLE.includes(milestone.status) ? (
            <OpenDisputeDialog
              contractId={contract.id}
              escrowId={contract.escrowId}
              milestoneId={milestone.id}
            />
          ) : null}

          {lastDispute ? (
            <Button asChild variant="outline">
              <Link href={`/disputes/${lastDispute.id}`}>View dispute</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DeliverDialog({
  contractId,
  milestoneId,
  kpis,
}: {
  contractId: string;
  milestoneId: string;
  kpis: JobKpi[];
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const deliver = useContractAction(
    contractId,
    async ({ body, file }: { body: DeliveryInput; file: File | null }) => {
      const deliverable = await api<Deliverable>(
        `/milestones/${milestoneId}/deliveries`,
        {
          method: 'POST',
          body,
        },
      );
      if (!file) return;
      try {
        await upload(`/deliverables/${deliverable.id}/attachment`, 'file', file, '5 MB');
      } catch (error) {
        // The delivery itself went through; only the file is missing.
        toast.error(
          `Delivered, but the file did not upload: ${errorMessage(error)}. Attach it again from the milestone.`,
        );
      }
    },
    'Delivered. The startup will review it.',
  );

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    const problem = chosen ? attachmentProblem(chosen) : null;
    if (problem) {
      toast.error(problem);
      event.target.value = '';
      setFile(null);
      return;
    }
    setFile(chosen);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const body: DeliveryInput = {
      url: values.url,
      ...(values.note ? { note: values.note } : {}),
      ...(kpis.length > 0
        ? {
            results: kpis.map((kpi) => ({
              kpiId: kpi.id,
              value: values[`result-${kpi.id}`],
              ...(values[`comment-${kpi.id}`]
                ? { comment: values[`comment-${kpi.id}`] }
                : {}),
            })),
          }
        : {}),
    };
    deliver.mutate(
      { body, file },
      {
        onSuccess: () => {
          setOpen(false);
          setFile(null);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Deliver</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deliver this milestone</DialogTitle>
          <DialogDescription>
            Share a link to the work: a document, folder, report or campaign.
            {kpis.length > 0
              ? ' Then report where each KPI stands, so the startup can compare it with the target.'
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            name="url"
            type="url"
            pattern="https://.+"
            title="A link that starts with https://"
            required
            placeholder="https://"
            aria-label="Link to the work"
          />
          <Textarea
            name="note"
            maxLength={2000}
            placeholder="A note for the startup (optional)"
            aria-label="Note for the startup"
          />

          {kpis.length > 0 ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-navy">Results</legend>
              {kpis.map((kpi) => (
                <div key={kpi.id} className="space-y-1.5 rounded-xl bg-muted/50 p-3">
                  <label
                    htmlFor={`result-${kpi.id}`}
                    className="block text-sm font-medium text-navy"
                  >
                    {kpi.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      Target: {kpiTarget(kpi)}
                    </span>
                  </label>
                  <Input
                    id={`result-${kpi.id}`}
                    name={`result-${kpi.id}`}
                    required
                    maxLength={120}
                    placeholder='Result, e.g. 48, or "Not measurable yet"'
                  />
                  <Input
                    name={`comment-${kpi.id}`}
                    maxLength={500}
                    placeholder="Comment (optional)"
                    aria-label={`Comment on ${kpi.name}`}
                  />
                </div>
              ))}
            </fieldset>
          ) : null}

          <div className="space-y-1">
            <label htmlFor="attachment" className="block text-sm font-medium text-navy">
              A file backing it (optional)
            </label>
            <Input
              id="attachment"
              type="file"
              accept={ATTACHMENT_TYPES.join(',')}
              onChange={onFileChosen}
            />
            <p className="text-xs text-muted-foreground">
              A PDF report or a screenshot (PNG, JPEG or WebP), up to 5 MB. Only the
              startup and Pocket managers can open it.
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={deliver.isPending}>
              {deliver.isPending ? 'Sending...' : 'Send delivery'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestChangesDialog({
  contractId,
  milestoneId,
}: {
  contractId: string;
  milestoneId: string;
}) {
  const [open, setOpen] = useState(false);
  const request = useContractAction(
    contractId,
    (feedback: string) =>
      api(`/milestones/${milestoneId}/request-changes`, {
        method: 'POST',
        body: { feedback },
      }),
    'Sent back to the specialist',
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.mutate(formValues(event.currentTarget).feedback, {
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Ask for changes</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask for changes</DialogTitle>
          <DialogDescription>
            The specialist sees your note and delivers a new version.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Textarea
            name="feedback"
            required
            minLength={5}
            maxLength={2000}
            placeholder="What should change"
          />
          <DialogFooter>
            <Button type="submit" disabled={request.isPending}>
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpenDisputeDialog({
  contractId,
  escrowId,
  milestoneId,
}: {
  contractId: string;
  escrowId: string | null;
  milestoneId: string;
}) {
  const [open, setOpen] = useState(false);
  const signer = useSigner();
  // The reason travels with the signed transaction, so this does not use prepareSignSubmit.
  const dispute = useContractAction(
    contractId,
    async (reason: string) => {
      const prepared = await api<PreparedTransaction>(
        `/milestones/${milestoneId}/dispute/prepare`,
        { method: 'POST' },
      );
      const signedXdr = await signer.sign(prepared.xdr, prepared.networkPassphrase, {
        kind: 'dispute',
        escrowId,
      });
      return api(`/milestones/${milestoneId}/dispute`, {
        method: 'POST',
        body: { signedXdr, reason },
      });
    },
    'Dispute opened. A manager will review it.',
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispute.mutate(formValues(event.currentTarget).reason, {
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Open a dispute</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a dispute</DialogTitle>
          <DialogDescription>
            This milestone&apos;s funds freeze in the escrow until a Pocket manager
            decides: pay the specialist, refund the startup, or split it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Textarea
            name="reason"
            required
            minLength={10}
            maxLength={2000}
            placeholder="What went wrong"
            rows={4}
          />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={dispute.isPending}>
              {dispute.isPending ? 'Waiting for your wallet...' : 'Sign and open dispute'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

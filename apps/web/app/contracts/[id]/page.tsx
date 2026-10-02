'use client';

import {
  TRUSTLESS_WORK_FEE_PERCENT,
  totalAfterTrustlessWorkFee,
  type ChainOperationKind,
  type ContractDetail,
  type User,
} from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MilestoneCard } from '@/components/contract/milestone-card';
import { Detail, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { UsdcStatus } from '@/components/usdc-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiError, api, errorMessage } from '@/lib/api';
import { dateTime, explorerContract, explorerTx, shortAddress, usdc } from '@/lib/format';
import { useContractAction } from '@/lib/use-contract-action';
import { useSigner } from '@/components/use-signer';
import { prepareSignSubmit } from '@/lib/wallet';

const OPERATION_LABELS: Record<ChainOperationKind, string> = {
  trustline: 'USDC enabled',
  deploy: 'Escrow deployed',
  fund: 'Escrow funded',
  approve: 'Milestone approved',
  release: 'Payment released',
  dispute: 'Dispute opened',
  resolve: 'Dispute resolved',
  payment: 'USDC sent',
};

export default function ContractPage() {
  return (
    <RequireAuth roles={['startup', 'specialist', 'manager']}>
      {(user) => <Contract user={user} />}
    </RequireAuth>
  );
}

function Contract({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>();
  const contract = useQuery({
    queryKey: ['contracts', id],
    queryFn: () => api<ContractDetail>(`/contracts/${id}`),
    // While it waits for the other party, keep looking.
    refetchInterval: (query) => (waitsForOtherParty(query.state.data) ? 15_000 : false),
  });

  if (contract.isLoading) return <Loading />;
  if (contract.error || !contract.data)
    return <ErrorAlert error={contract.error} title="Contract not found" />;
  const data = contract.data;
  const isParty = user.id === data.startupId || user.id === data.specialistId;
  const startupName = data.startup.startupProfile?.companyName ?? 'Startup';
  const specialistName = data.specialist.specialistProfile?.displayName ?? 'Specialist';
  const titleFor = (milestoneId: string | null) =>
    data.milestones.find((milestone) => milestone.id === milestoneId)?.title;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.job.title}
        description={
          <>
            <Link href={`/startups/${data.startupId}`} className="underline">
              {startupName}
            </Link>{' '}
            hired{' '}
            <Link href={`/specialists/${data.specialistId}`} className="underline">
              {specialistName}
            </Link>
          </>
        }
        actions={<StatusBadge status={data.status} className="px-3 py-1 text-sm" />}
      />

      {isParty && data.status !== 'completed' && data.status !== 'cancelled' ? (
        <UsdcStatus user={user} />
      ) : null}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Total">{usdc(data.amount)}</Detail>
          <Detail label="Escrow">
            {data.escrowId ? (
              <a
                href={explorerContract(data.escrowId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                {shortAddress(data.escrowId)} <ExternalLinkIcon className="size-3" />
              </a>
            ) : (
              'Not deployed yet'
            )}
          </Detail>
          {/* Contacts are shared once the specialist accepts the terms. */}
          <Detail label={`${startupName} contact`}>
            {data.contacts.startup ?? 'Shared once the terms are accepted'}
          </Detail>
          <Detail label={`${specialistName} contact`}>
            {data.contacts.specialist ?? 'Shared once the terms are accepted'}
          </Detail>
        </CardContent>
      </Card>

      <NextStep contract={data} user={user} />

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-navy">Milestones</h2>
        {data.milestones.map((milestone) => (
          <MilestoneCard
            key={milestone.id}
            contract={data}
            milestone={milestone}
            user={user}
          />
        ))}
      </section>

      {data.chainOperations.length > 0 ? (
        <section>
          <h2 className="mb-3 text-xl font-bold text-navy">On-chain history</h2>
          <Card>
            <CardContent className="divide-y divide-border pt-2">
              {data.chainOperations.map((operation) => (
                <div
                  key={operation.id}
                  className="flex flex-col gap-1 py-3 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <span className="font-medium text-navy">
                      {OPERATION_LABELS[operation.kind]}
                    </span>
                    {titleFor(operation.milestoneId) ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · {titleFor(operation.milestoneId)}
                      </span>
                    ) : null}
                    {operation.amount ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · {usdc(operation.amount)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{dateTime(operation.confirmedAt)}</span>
                    <a
                      href={explorerTx(operation.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs underline"
                    >
                      {operation.txHash.slice(0, 10)}...{' '}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

/** The step the contract is waiting for, and who has to take it. */
function NextStep({ contract, user }: { contract: ContractDetail; user: User }) {
  const isStartup = user.id === contract.startupId;
  const isSpecialist = user.id === contract.specialistId;
  const signer = useSigner();

  const accept = useContractAction(
    contract.id,
    () => api(`/contracts/${contract.id}/accept`, { method: 'POST' }),
    "Accepted. The escrow is deployed and waiting for the startup's funds.",
  );
  const decline = useContractAction(
    contract.id,
    () => api(`/contracts/${contract.id}/decline`, { method: 'POST' }),
    'Terms declined',
  );
  const fund = useContractAction(
    contract.id,
    () =>
      prepareSignSubmit(
        signer.sign,
        { kind: 'fund', escrowId: contract.escrowId, amount: contract.amount },
        `/contracts/${contract.id}/fund/prepare`,
        `/contracts/${contract.id}/fund/submit`,
      ),
    'Escrow funded. The specialist can start.',
  );
  const sync = useContractAction(
    contract.id,
    () => api(`/contracts/${contract.id}/fund/sync`, { method: 'POST' }),
    'Escrow funded. The specialist can start.',
  );
  // The network can take a while to confirm a deposit (409 or 503): say so,
  // and never offer a second deposit as the way out.
  const fundingPending =
    fund.error instanceof ApiError && [409, 503].includes(fund.error.status);
  const specialistReceives = usdc(
    totalAfterTrustlessWorkFee(contract.milestones.map((milestone) => milestone.amount)),
  );

  if (contract.status === 'awaiting_specialist') {
    if (isStartup) return <WithdrawOffer contract={contract} />;
    if (!isSpecialist) {
      return (
        <Waiting
          title="Waiting for the specialist"
          text="They review the milestones and accept or decline the terms."
        />
      );
    }
    return (
      <Card className="border-yellow">
        <CardHeader>
          <CardTitle>Review the terms</CardTitle>
          <CardDescription>
            If you accept, Pocket deploys an escrow on Stellar with these milestones,
            paying your wallet. Then the startup funds it. Trustless Work, which runs the
            escrow, keeps {TRUSTLESS_WORK_FEE_PERCENT}% of each payment, so you receive{' '}
            {specialistReceives} of the {usdc(contract.amount)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
            {accept.isPending ? 'Deploying the escrow...' : 'Accept terms'}
          </Button>
          <Button
            variant="outline"
            disabled={decline.isPending}
            onClick={() => {
              if (
                window.confirm(
                  'Decline these terms? The startup can then pick someone else.',
                )
              )
                decline.mutate();
            }}
          >
            Decline
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (contract.status === 'awaiting_funding') {
    if (!isStartup) {
      return (
        <Waiting
          title="Waiting for the startup to fund the escrow"
          text="Do not start the work before the escrow is funded."
        />
      );
    }
    return (
      <Card className="border-yellow">
        <CardHeader>
          <CardTitle>Fund the escrow</CardTitle>
          <CardDescription>
            Sign one transaction to lock {usdc(contract.amount)} in the escrow. Nobody can
            move it alone: each milestone is released when you approve it. Trustless Work
            keeps {TRUSTLESS_WORK_FEE_PERCENT}% of each payment, so the specialist
            receives {specialistReceives}. Pocket charges nothing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fundingPending ? (
            <p className="text-sm text-muted-foreground">
              Your deposit is being confirmed by the network. Check again in a minute; do
              not fund again.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {fundingPending ? null : (
              <Button disabled={fund.isPending} onClick={() => fund.mutate()}>
                {fund.isPending
                  ? 'Waiting for your wallet...'
                  : `Fund ${usdc(contract.amount)}`}
              </Button>
            )}
            {/* Always there: after a reload the error is gone, the deposit is not. */}
            <Button
              variant="outline"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
            >
              {sync.isPending ? 'Checking...' : 'Already funded? Check again'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (contract.status === 'completed') {
    return (
      <Alert>
        <AlertTitle>Contract completed</AlertTitle>
        <AlertDescription>
          Every milestone was paid or resolved on {dateTime(contract.completedAt)}.
        </AlertDescription>
      </Alert>
    );
  }

  if (contract.status === 'cancelled') {
    return (
      <Alert>
        <AlertTitle>Contract cancelled</AlertTitle>
        <AlertDescription>
          <p>The specialist declined the terms, so the job was opened again.</p>
          {isStartup ? (
            <Button asChild size="sm" className="mt-3">
              <Link href={`/jobs/${contract.jobId}/applicants`}>Choose another applicant</Link>
            </Button>
          ) : isSpecialist ? (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/jobs">Browse jobs</Link>
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

/**
 * The startup waits for the specialist, and can take the terms back to fix
 * them or to choose someone else while they are not accepted.
 */
function WithdrawOffer({ contract }: { contract: ContractDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () =>
      api<{ jobId: string }>(`/contracts/${contract.id}/withdraw`, { method: 'POST' }),
    onSuccess: async ({ jobId }) => {
      toast.success('Offer withdrawn. The job is open again.');
      // The offer no longer exists: leave its page before anything reloads it.
      router.replace(`/jobs/${jobId}/applicants`);
      queryClient.removeQueries({ queryKey: ['contracts', contract.id] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contracts', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
      ]);
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      await queryClient.invalidateQueries({ queryKey: ['contracts', contract.id] });
    },
  });

  return (
    <Alert className="border-celeste bg-celeste-light/40">
      <AlertTitle>Waiting for the specialist</AlertTitle>
      <AlertDescription>
        <p>They review the milestones and accept or decline the terms.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={withdraw.isPending}
          onClick={() => {
            if (
              window.confirm(
                'Withdraw these terms? The job opens again and you can send new terms to this or another applicant.',
              )
            )
              withdraw.mutate();
          }}
        >
          {withdraw.isPending ? 'Withdrawing...' : 'Withdraw offer'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function Waiting({ title, text }: { title: string; text: string }) {
  return (
    <Alert className="border-celeste bg-celeste-light/40">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

/** Whether the contract is waiting on something the other party does. */
function waitsForOtherParty(contract: ContractDetail | undefined): boolean {
  if (!contract) return false;
  if (contract.status === 'awaiting_specialist' || contract.status === 'awaiting_funding') {
    return true;
  }
  return (
    contract.status === 'active' &&
    contract.milestones.some((milestone) =>
      ['pending', 'delivered', 'changes_requested', 'approved', 'disputed'].includes(
        milestone.status,
      ),
    )
  );
}

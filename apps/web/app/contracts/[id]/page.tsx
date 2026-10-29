'use client';

import {
  POCKET_FEE_PERCENT,
  TRUSTLESS_WORK_FEE_PERCENT,
  totalAfterFees,
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
import { ReportTemplateButton } from '@/components/report-template';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { UsdcStatus } from '@/components/usdc-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm-dialog';
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
  trustline: 'USDC habilitado',
  deploy: 'Contrato creado en Stellar',
  fund: 'Pago depositado en el contrato',
  approve: 'Hito aprobado',
  release: 'Pago liberado',
  dispute: 'Disputa abierta',
  resolve: 'Disputa resuelta',
  payment: 'USDC enviado',
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
    return <ErrorAlert error={contract.error} title="No se encontró el contrato" />;
  const data = contract.data;
  const isParty = user.id === data.startupId || user.id === data.specialistId;
  const startupName = data.startup.startupProfile?.companyName ?? 'Startup';
  const specialistName = data.specialist.specialistProfile?.displayName ?? 'Experto';
  const contactPending =
    data.status === 'awaiting_specialist'
      ? 'Se comparte cuando se aceptan los términos'
      : 'No indicado';
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
            contrató a{' '}
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
          <Detail label="Contrato en Stellar">
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
              'Todavía no está creado'
            )}
          </Detail>
          {/* Contacts are shared once the specialist accepts the terms. */}
          <Detail label={`Contacto de ${startupName}`}>
            {data.contacts.startup ?? contactPending}
          </Detail>
          <Detail label={`Contacto de ${specialistName}`}>
            {data.contacts.specialist ?? contactPending}
          </Detail>
        </CardContent>
      </Card>

      <NextStep contract={data} user={user} />

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-navy">Hitos</h2>
        {data.job.reportTemplate ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {user.id === data.specialistId
                ? 'Completa la plantilla de reporte de la startup y adjúntala a cada entrega.'
                : 'El experto completa esta plantilla de reporte y la adjunta a cada entrega.'}
            </p>
            <ReportTemplateButton
              jobId={data.job.id}
              template={data.job.reportTemplate}
            />
          </div>
        ) : null}
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
          <h2 className="mb-3 text-xl font-bold text-navy">Historial en Stellar</h2>
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
  const confirm = useConfirm();

  const accept = useContractAction(
    contract.id,
    () => api(`/contracts/${contract.id}/accept`, { method: 'POST' }),
    'Aceptaste. El contrato ya está creado en Stellar y espera el depósito de la startup.',
  );
  const decline = useContractAction(
    contract.id,
    () => api(`/contracts/${contract.id}/decline`, { method: 'POST' }),
    'Rechazaste los términos',
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
    'Pago depositado en el contrato. El experto ya puede empezar.',
  );
  const sync = useContractAction(
    contract.id,
    () => api(`/contracts/${contract.id}/fund/sync`, { method: 'POST' }),
    'Pago depositado en el contrato. El experto ya puede empezar.',
  );
  // The network can take a while to confirm a deposit (409 or 503): say so,
  // and never offer a second deposit as the way out.
  const fundingPending =
    fund.error instanceof ApiError && [409, 503].includes(fund.error.status);
  const specialistReceives = usdc(
    totalAfterFees(contract.milestones.map((milestone) => milestone.amount)),
  );

  if (contract.status === 'awaiting_specialist') {
    if (isStartup) return <WithdrawOffer contract={contract} />;
    if (!isSpecialist) {
      return (
        <Waiting
          title="Esperando al experto"
          text="El experto revisa los hitos y acepta o rechaza los términos."
        />
      );
    }
    return (
      <Card className="border-yellow">
        <CardHeader>
          <CardTitle>Revisa los términos</CardTitle>
          <CardDescription>
            Si aceptas, Pocket crea un contrato en Stellar con estos hitos y con tu wallet
            como destino de los pagos. Después, la startup deposita el pago. Trustless
            Work, que opera el contrato, se queda con el {TRUSTLESS_WORK_FEE_PERCENT}% de
            cada pago y Pocket con el {POCKET_FEE_PERCENT}%, así que recibes{' '}
            {specialistReceives} de los {usdc(contract.amount)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
            {accept.isPending ? 'Creando el contrato en Stellar...' : 'Aceptar términos'}
          </Button>
          <Button
            variant="outline"
            disabled={decline.isPending}
            onClick={async () => {
              const confirmed = await confirm({
                title: '¿Rechazar estos términos?',
                description: 'La startup podrá elegir a otra persona.',
                confirmText: 'Rechazar',
                destructive: true,
              });
              if (confirmed) decline.mutate();
            }}
          >
            Rechazar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (contract.status === 'awaiting_funding') {
    if (!isStartup) {
      return (
        <Waiting
          title="Esperando que la startup deposite el pago en el contrato"
          text="No empieces el trabajo antes de que el pago esté depositado en el contrato."
        />
      );
    }
    return (
      <Card className="border-yellow">
        <CardHeader>
          <CardTitle>Deposita el pago en el contrato</CardTitle>
          <CardDescription>
            Firma una transacción para depositar {usdc(contract.amount)} en el contrato.
            Nadie puede mover ese dinero por su cuenta: cada hito se libera cuando lo
            apruebas. Trustless Work se queda con el {TRUSTLESS_WORK_FEE_PERCENT}% de cada
            pago y Pocket con el {POCKET_FEE_PERCENT}%, así que el experto recibe{' '}
            {specialistReceives}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fundingPending ? (
            <p className="text-sm text-muted-foreground">
              La red está confirmando tu depósito. Vuelve a revisar en un minuto; no
              deposites de nuevo.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {fundingPending ? null : (
              <Button disabled={fund.isPending} onClick={() => fund.mutate()}>
                {fund.isPending
                  ? 'Esperando tu wallet...'
                  : `Depositar ${usdc(contract.amount)}`}
              </Button>
            )}
            {/* Always there: after a reload the error is gone, the deposit is not. */}
            <Button
              variant="outline"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
            >
              {sync.isPending ? 'Revisando...' : '¿Ya depositaste? Revisar de nuevo'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (contract.status === 'completed') {
    return (
      <Alert>
        <AlertTitle>Contrato completado</AlertTitle>
        <AlertDescription>
          Todos los hitos se pagaron o se resolvieron el {dateTime(contract.completedAt)}.
        </AlertDescription>
      </Alert>
    );
  }

  if (contract.status === 'cancelled') {
    return (
      <Alert>
        <AlertTitle>Contrato cancelado</AlertTitle>
        <AlertDescription>
          <p>El experto rechazó los términos, así que el trabajo se volvió a abrir.</p>
          {isStartup ? (
            <Button asChild size="sm" className="mt-3">
              <Link href={`/jobs/${contract.jobId}/applicants`}>
                Elegir a otro postulante
              </Link>
            </Button>
          ) : isSpecialist ? (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/jobs">Ver trabajos</Link>
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
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () =>
      api<{ jobId: string }>(`/contracts/${contract.id}/withdraw`, { method: 'POST' }),
    onSuccess: async ({ jobId }) => {
      toast.success('Oferta retirada. El trabajo está abierto de nuevo.');
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
      <AlertTitle>Esperando al experto</AlertTitle>
      <AlertDescription>
        <p>El experto revisa los hitos y acepta o rechaza los términos.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={withdraw.isPending}
          onClick={async () => {
            const confirmed = await confirm({
              title: '¿Retirar estos términos?',
              description:
                'El trabajo se vuelve a abrir y puedes enviar nuevos términos a este u otro postulante.',
              confirmText: 'Retirar',
              destructive: true,
            });
            if (confirmed) withdraw.mutate();
          }}
        >
          {withdraw.isPending ? 'Retirando...' : 'Retirar oferta'}
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
  if (
    contract.status === 'awaiting_specialist' ||
    contract.status === 'awaiting_funding'
  ) {
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

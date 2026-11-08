'use client';

import type { ContractDetail, User } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { IDENTITY_FOR_CONTRACT } from '@/components/activation';
import { ContractSteps } from '@/components/contract/contract-steps';
import { FeeBreakdown } from '@/components/contract/fee-breakdown';
import { MilestoneCard } from '@/components/contract/milestone-card';
import { MoneyStepStatus, stageLabel } from '@/components/contract/money-step-status';
import { ResultsCard } from '@/components/contract/results';
import { sentStep } from '@/components/contract/sent-step';
import { WorkHistory } from '@/components/contract/work-history';
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
import { dateTime, explorerContract, usdc } from '@/lib/format';
import { ON_MAINNET } from '@/lib/network';
import { useContractAction } from '@/lib/use-contract-action';
import { useMoneyStep } from '@/lib/use-money-step';
import { useNow } from '@/lib/use-now';
import { useSigner } from '@/components/use-signer';
import { prepareSignSubmit } from '@/lib/wallet';

export default function ContractPage() {
  return (
    <RequireAuth roles={['startup', 'specialist', 'manager']}>
      {(user) => <Contract user={user} />}
    </RequireAuth>
  );
}

function Contract({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>();
  const now = useNow(30_000);
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
        actions={
          <StatusBadge status={headerStatus(data, now)} className="px-3 py-1 text-sm" />
        }
      />

      <ContractSteps contract={data} user={user} />

      {isParty && data.status !== 'completed' && data.status !== 'cancelled' ? (
        <UsdcStatus user={user} />
      ) : null}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Total">{usdc(data.amount)}</Detail>
          <Detail label="Pago protegido">
            {protectionText(data, now)}
            {data.escrowId ? (
              <a
                href={explorerContract(data.escrowId)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex w-fit items-center gap-1 text-xs text-muted-foreground underline"
              >
                Ver comprobante <ExternalLinkIcon className="size-3" />
              </a>
            ) : null}
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

      <NextStep contract={data} user={user} specialistName={specialistName} />

      {data.status === 'active' || data.status === 'completed' ? (
        <ResultsCard contractId={data.id} />
      ) : null}

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

      <WorkHistory
        contract={data}
        startupName={startupName}
        specialistName={specialistName}
      />
    </div>
  );
}

/** A step sent to the network shows in the badge before the contract moves on. */
function headerStatus(contract: ContractDetail, now: number): string {
  const sending = (kind: 'deploy' | 'fund') =>
    sentStep(contract, kind, null, now) === 'sending';
  if (contract.status === 'awaiting_specialist' && sending('deploy')) return 'preparing';
  if (contract.status === 'awaiting_funding' && sending('fund')) {
    return 'confirming_deposit';
  }
  return contract.status;
}

/** Where the money stands, in words instead of a network address. */
function protectionText(contract: ContractDetail, now: number): string {
  switch (contract.status) {
    case 'awaiting_specialist':
      return sentStep(contract, 'deploy', null, now) === 'sending'
        ? 'Se está creando'
        : 'Se crea cuando el experto acepta';
    case 'awaiting_funding':
      return 'Creado, esperando el depósito';
    case 'active':
      return 'Activo: el pago está depositado';
    case 'completed':
      return 'Terminado';
    default:
      return 'No se creó';
  }
}

/** The step the contract is waiting for, and who has to take it. */
function NextStep({
  contract,
  user,
  specialistName,
}: {
  contract: ContractDetail;
  user: User;
  specialistName: string;
}) {
  const isStartup = user.id === contract.startupId;
  const isSpecialist = user.id === contract.specialistId;
  const signer = useSigner();
  const confirm = useConfirm();
  const accepting = useMoneyStep();
  const funding = useMoneyStep();
  const now = useNow(30_000);
  const amounts = contract.milestones.map((milestone) => milestone.amount);

  const accept = useContractAction(
    contract.id,
    async () => {
      // Pocket creates the contract on the network now: guard the page meanwhile.
      accepting.onStage('sending');
      try {
        return await api(`/contracts/${contract.id}/accept`, { method: 'POST' });
      } finally {
        accepting.done();
      }
    },
    'Aceptaste. El pago protegido está listo y espera el depósito de la startup.',
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
        {},
        funding.onStage,
      ).finally(funding.done),
    'Pago depositado. El experto ya puede empezar.',
  );
  const sync = useContractAction(
    contract.id,
    () => api(`/contracts/${contract.id}/fund/sync`, { method: 'POST' }),
    'Pago depositado. El experto ya puede empezar.',
  );

  // Sent before a reload, or by another tab: wait for it unless it is stuck.
  const deploying =
    sentStep(contract, 'deploy', null, now) === 'sending' && !accept.isPending;
  // A deposit already sent (this page, an error, or before a reload): the
  // network is confirming it, so a second deposit is not offered meanwhile.
  const fundingPending =
    sentStep(contract, 'fund', null, now) === 'sending' ||
    (fund.error instanceof ApiError && [409, 503].includes(fund.error.status));

  if (contract.status === 'awaiting_specialist') {
    if (isStartup) return <WithdrawOffer contract={contract} now={now} />;
    if (!isSpecialist) {
      return (
        <Waiting
          title="Esperando al experto"
          text="El experto revisa los hitos y acepta o rechaza los términos."
        />
      );
    }
    const preparing = accept.isPending || deploying;
    const identityChecked = user.verificationStatus === 'approved';
    return (
      <Card className="border-warning">
        <CardHeader>
          <CardTitle>
            {preparing
              ? 'Preparando tu contrato'
              : 'Tu siguiente paso: revisa los hitos y acepta los términos'}
          </CardTitle>
          <CardDescription>
            {preparing
              ? 'Pocket está creando el pago protegido con estos hitos y con tu wallet como destino de los pagos. Toma unos segundos.'
              : 'Si aceptas, Pocket crea un pago protegido con estos hitos y con tu wallet como destino de los pagos. Después la startup deposita el pago y empiezas a trabajar.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FeeBreakdown
            amounts={amounts}
            totalLabel="Monto del contrato"
            netLabel="Recibes en total"
          />
          {/* Accepting takes the identity check: the one step a specialist's details skip. */}
          {!deploying && !identityChecked ? (
            <p className="text-sm text-muted-foreground">{IDENTITY_FOR_CONTRACT}</p>
          ) : null}
          {deploying ? (
            <p className="text-sm text-muted-foreground">
              Esta página se actualiza sola cuando el contrato esté listo.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {identityChecked ? (
                <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
                  {accept.isPending
                    ? 'Preparando tu contrato...'
                    : accept.isError
                      ? 'Reintentar'
                      : 'Aceptar términos'}
                </Button>
              ) : (
                <Button asChild>
                  <Link
                    href={`/verification?next=${encodeURIComponent(`/contracts/${contract.id}`)}`}
                  >
                    Verificar mi identidad
                  </Link>
                </Button>
              )}
              <Button
                variant="outline"
                disabled={decline.isPending || accept.isPending}
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
            </div>
          )}
          <MoneyStepStatus
            stage={accepting.stage}
            slow={accepting.slow}
            sending="Pocket está creando el pago protegido."
          />
        </CardContent>
      </Card>
    );
  }

  if (contract.status === 'awaiting_funding') {
    if (!isStartup) {
      return (
        <Waiting
          title="Esperando que la startup deposite el pago"
          text="No empieces el trabajo antes de que el pago esté depositado: esta página te avisa cuando pase."
        />
      );
    }
    return (
      <Card className="border-warning">
        <CardHeader>
          <CardTitle>
            {fundingPending
              ? 'Tu depósito se está confirmando'
              : 'Tu siguiente paso: deposita el pago'}
          </CardTitle>
          <CardDescription>
            Firma una transacción para depositar {usdc(contract.amount)} en el pago
            protegido. Nadie puede mover ese dinero por su cuenta: cada hito se libera
            cuando lo apruebas.
            {ON_MAINNET
              ? ' Es USDC real: revisa el monto en tu wallet antes de firmar.'
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FeeBreakdown
            amounts={amounts}
            totalLabel="Depositas"
            netLabel="Recibe el experto"
          />
          {fundingPending ? (
            <p className="text-sm text-muted-foreground">
              La red está confirmando tu depósito. No deposites de nuevo: esta página se
              actualiza sola.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {fundingPending ? null : (
              <Button disabled={fund.isPending} onClick={() => fund.mutate()}>
                {funding.stage
                  ? stageLabel(funding.stage, 'Depositando...')
                  : `Depositar ${usdc(contract.amount)}`}
              </Button>
            )}
            {/* Always there: after a reload the error is gone, the deposit is not. */}
            <Button
              variant="outline"
              disabled={sync.isPending || fund.isPending}
              onClick={() => sync.mutate()}
            >
              {sync.isPending ? 'Revisando...' : '¿Ya depositaste? Revisar de nuevo'}
            </Button>
          </div>
          <MoneyStepStatus
            stage={funding.stage}
            slow={funding.slow}
            sending="Depositando el pago en el contrato."
          />
        </CardContent>
      </Card>
    );
  }

  if (contract.status === 'active') {
    const next = activeStep(contract, isStartup, isSpecialist, specialistName, now);
    return next ? <Waiting title={next.title} text={next.text} href={next.href} /> : null;
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

/** What an active contract waits for, and from whom, pointing at the milestone. */
function activeStep(
  contract: ContractDetail,
  isStartup: boolean,
  isSpecialist: boolean,
  specialistName: string,
  now: number,
): { title: string; text: string; href?: string } | null {
  const first = (...statuses: string[]) =>
    contract.milestones.find((milestone) => statuses.includes(milestone.status));
  const anchor = (milestone: { position: number }) => `#hito-${milestone.position + 1}`;

  const disputed = first('disputed');
  if (disputed) {
    return {
      title: `Hay una disputa abierta en el hito ${disputed.position + 1}`,
      text: 'Un manager de Pocket la revisa y decide cómo se reparte ese pago. El resto del contrato sigue.',
      href: anchor(disputed),
    };
  }
  // A delivery whose approval was already sent is being paid, not reviewed.
  const paying = contract.milestones.find(
    (milestone) =>
      milestone.status === 'approved' ||
      (milestone.status === 'delivered' &&
        sentStep(contract, 'approve', milestone.id, now) === 'sending'),
  );
  if (paying) {
    return {
      title: `El pago del hito ${paying.position + 1} se está liberando`,
      text: isSpecialist
        ? 'La startup aprobó tu entrega. El pago llega a tu wallet en cuanto la red lo confirme.'
        : 'Tu aprobación ya se envió. El pago se libera solo: no hace falta aprobar de nuevo.',
      href: anchor(paying),
    };
  }
  const delivered = first('delivered');
  const toDeliver = first('changes_requested', 'pending');
  if (isStartup && delivered) {
    return {
      title: `Tu siguiente paso: revisa la entrega del hito ${delivered.position + 1}`,
      text: 'Apruébala para liberar el pago, o pide cambios si algo falta.',
      href: anchor(delivered),
    };
  }
  if (isSpecialist && toDeliver) {
    return {
      title:
        toDeliver.status === 'changes_requested'
          ? `Tu siguiente paso: entrega una nueva versión del hito ${toDeliver.position + 1}`
          : `Tu siguiente paso: entrega el hito ${toDeliver.position + 1}`,
      text:
        toDeliver.status === 'changes_requested'
          ? 'La startup pidió cambios. Están arriba de tu última versión.'
          : 'Cuando lo tengas, compártelo con un enlace y reporta cómo van los KPIs.',
      href: anchor(toDeliver),
    };
  }
  if (isSpecialist && delivered) {
    return {
      title: `Esperando que la startup revise tu entrega del hito ${delivered.position + 1}`,
      text: 'Cuando la apruebe, el pago llega a tu wallet.',
      href: anchor(delivered),
    };
  }
  if (isStartup && toDeliver) {
    return {
      title: `Esperando que ${specialistName} entregue el hito ${toDeliver.position + 1}`,
      text: 'Te avisamos cuando haya una entrega para revisar.',
      href: anchor(toDeliver),
    };
  }
  return null;
}

/**
 * The startup waits for the specialist, and can take the terms back to fix
 * them or to choose someone else while they are not accepted.
 */
function WithdrawOffer({ contract, now }: { contract: ContractDetail; now: number }) {
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

  // Once the specialist accepted, Pocket is creating the contract: nothing to take back.
  if (sentStep(contract, 'deploy', null, now) === 'sending') {
    return (
      <Waiting
        title="El experto aceptó"
        text="Pocket está creando el pago protegido. En cuanto esté listo, te toca depositar el pago."
      />
    );
  }

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

function Waiting({ title, text, href }: { title: string; text: string; href?: string }) {
  return (
    <Alert className="border-celeste bg-celeste-light/40">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>
          {text}
          {href ? (
            <>
              {' '}
              <a href={href} className="font-medium underline">
                Ir al hito
              </a>
            </>
          ) : null}
        </p>
      </AlertDescription>
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

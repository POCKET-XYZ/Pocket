'use client';

import type {
  ContractDetail,
  Deliverable,
  DeliveryInput,
  Dispute,
  JobKpi,
  JobReportTemplate,
  User,
} from '@pocket/shared';
import { CheckIcon, ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formValues } from '@/components/form';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm-dialog';
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
  KpiOutcomeBadge,
  KpiReport,
  attachmentProblem,
  kpiOutcome,
  kpiTarget,
} from '@/components/contract/kpi-report';
import { MoneyStepStatus, stageLabel } from '@/components/contract/money-step-status';
import { sentStep } from '@/components/contract/sent-step';
import { ReportTemplateButton } from '@/components/report-template';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage, upload } from '@/lib/api';
import { ON_MAINNET } from '@/lib/network';
import { ATTACHMENT_ACCEPT } from '@/lib/files';
import { toast } from 'sonner';
import { date, dateTime, usdc } from '@/lib/format';
import { useContractAction } from '@/lib/use-contract-action';
import { useMoneyStep } from '@/lib/use-money-step';
import { useNow } from '@/lib/use-now';
import { useSigner } from '@/components/use-signer';
import { prepareSignSubmit, type PreparedTransaction } from '@/lib/wallet';
import { linkHost, safeHref } from '@/lib/links';

type MilestoneWithHistory = ContractDetail['milestones'][number];

/** A milestone can be disputed while the work is under way or delivered. */
const DISPUTABLE = ['pending', 'delivered', 'changes_requested'];

/** How a KPI result reads when the specialist could not measure it yet. */
const UNMEASURED = /todav[ií]a no se puede medir/i;

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
  const older = milestone.deliverables.slice(0, -1).reverse();
  const changesAsked = milestone.status === 'changes_requested' && latest?.feedback;
  const signer = useSigner();
  const confirm = useConfirm();
  const money = useMoneyStep();
  const now = useNow(30_000);

  // An approval already sent (this page, or before a reload): the API finishes
  // it and releases the payment, so the button must not come back meanwhile.
  // One that never moved on is offered again, with a way to check it first.
  const approval =
    milestone.status === 'delivered'
      ? sentStep(contract, 'approve', milestone.id, now)
      : 'none';
  const approving = approval === 'sending';
  const approvalStuck = approval === 'stuck';

  const approve = useContractAction(
    contract.id,
    () =>
      prepareSignSubmit(
        signer.sign,
        { kind: 'approve', escrowId: contract.escrowId },
        `/milestones/${milestone.id}/approve/prepare`,
        `/milestones/${milestone.id}/approve/submit`,
        {},
        money.onStage,
      ).finally(money.done),
    'Aprobado. El pago se liberó al experto.',
  );
  const retryRelease = useContractAction(
    contract.id,
    () => api(`/milestones/${milestone.id}/release`, { method: 'POST' }),
    'Pago liberado',
  );
  const approvalBusy = approve.isPending || approving;
  const unmeasured =
    latest?.kpiResults.some(
      (result) => result.numericValue === null && UNMEASURED.test(result.value),
    ) ?? false;

  return (
    <Card id={`hito-${milestone.position + 1}`} className="scroll-mt-24">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hito {milestone.position + 1} · fecha de entrega: {date(milestone.dueDate)}
            </p>
            <h3 className="mt-1 font-heading text-lg font-bold text-navy">
              {milestone.title}
            </h3>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground/80">
              {milestone.description}
            </p>
            {milestone.acceptanceCriteria ? (
              <p className="mt-2 whitespace-pre-line rounded-lg bg-celeste-light/40 px-3 py-2 text-sm">
                <span className="font-medium text-navy">Para aprobarlo: </span>
                {milestone.acceptanceCriteria}
              </p>
            ) : null}
            {milestone.revisionsUsed > 0 && !changesAsked ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {milestone.revisionsUsed} de {contract.job.revisionRounds} rondas de
                cambios usadas.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="font-semibold text-navy">{usdc(milestone.amount)}</span>
            <StatusBadge status={approving ? 'paying' : milestone.status} />
          </div>
        </div>

        {/* What the startup asked for comes first: it is what has to happen next. */}
        {changesAsked && latest ? (
          <div className="space-y-2 rounded-xl border border-warning bg-warning/15 p-3 text-sm">
            <p className="font-semibold text-navy">
              La startup pidió cambios
              {latest.feedbackAt ? (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · {dateTime(latest.feedbackAt)}
                </span>
              ) : null}
            </p>
            <p className="whitespace-pre-line">{latest.feedback}</p>
            <p className="text-xs text-muted-foreground">
              {milestone.revisionsUsed} de {contract.job.revisionRounds} rondas de cambios
              usadas.
              {roundsLeft
                ? ''
                : isSpecialist
                  ? ' Esta es la última: si la startup no aprueba la nueva versión, la siguiente opción es una disputa.'
                  : ' Era la última: la próxima versión se aprueba o se lleva a una disputa.'}
            </p>
            {isSpecialist ? (
              <p className="font-medium text-navy">
                Tu siguiente paso: entrega una nueva versión con estos cambios.
              </p>
            ) : null}
          </div>
        ) : null}

        {latest ? (
          <div className="space-y-3 rounded-xl bg-muted/60 p-3">
            <Version
              deliverable={latest}
              kpis={contract.job.kpis}
              label={
                changesAsked
                  ? `Versión ${latest.version}, con cambios pedidos`
                  : `Versión ${latest.version} · versión actual`
              }
            />
            {older.length > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground underline">
                  Ver{' '}
                  {older.length === 1
                    ? 'la versión anterior'
                    : `las ${older.length} versiones anteriores`}
                </summary>
                <div className="mt-3 space-y-3 border-l-2 border-border pl-3">
                  {older.map((deliverable) => (
                    <Version
                      key={deliverable.id}
                      deliverable={deliverable}
                      kpis={contract.job.kpis}
                      label={`Versión ${deliverable.version}`}
                      answeredBy={deliverable.version + 1}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {lastDispute?.status === 'resolved' ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            Disputa resuelta por un manager: {usdc(lastDispute.specialistAmount)} para el
            experto y {usdc(lastDispute.startupAmount)} de vuelta a la startup.
            {lastDispute.resolutionNote ? ` "${lastDispute.resolutionNote}"` : ''}
          </p>
        ) : null}

        {active &&
        isStartup &&
        milestone.status === 'delivered' &&
        unmeasured &&
        !approving ? (
          <p className="text-sm text-muted-foreground">
            Algunos resultados todavía no se pueden medir. Puedes aprobar igual: el
            experto los reporta en entregas siguientes y el reporte de resultados los
            muestra.
          </p>
        ) : null}

        {approvalStuck && (isStartup || isManager) ? (
          <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-navy">
            La aprobación que enviaste no terminó de confirmarse. Revisa de nuevo: si la
            red ya la tiene, el pago se libera; si no, puedes aprobar otra vez sin pagar
            dos veces.
          </p>
        ) : null}

        {approving ? (
          <p className="rounded-lg bg-celeste-light/50 px-3 py-2 text-sm text-navy">
            {isSpecialist
              ? 'La startup aprobó tu entrega. El pago se está liberando a tu wallet.'
              : 'Tu aprobación se está procesando y el pago se libera solo. No hace falta aprobar de nuevo: esta página se actualiza sola.'}
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
              jobId={contract.job.id}
              reportTemplate={contract.job.reportTemplate}
              again={milestone.status === 'changes_requested'}
            />
          ) : null}

          {active &&
          isSpecialist &&
          milestone.status === 'delivered' &&
          latest &&
          !approving ? (
            <AttachFileButton contractId={contract.id} deliverable={latest} />
          ) : null}

          {active && isStartup && milestone.status === 'delivered' && !approving ? (
            <>
              <Button
                disabled={approve.isPending}
                onClick={async () => {
                  const confirmed = await confirm({
                    title: `¿Aprobar esta entrega y liberar ${usdc(milestone.amount)} al experto?`,
                    description: ON_MAINNET
                      ? 'Se paga con USDC real y una aprobación no se puede deshacer.'
                      : 'Una aprobación no se puede deshacer.',
                    confirmText: 'Aprobar y pagar',
                    irreversible: true,
                  });
                  if (confirmed) approve.mutate();
                }}
              >
                {money.stage
                  ? stageLabel(money.stage, 'Liberando el pago...')
                  : 'Aprobar y pagar'}
              </Button>
              {roundsLeft ? (
                <RequestChangesDialog
                  contractId={contract.id}
                  milestoneId={milestone.id}
                  disabled={approve.isPending}
                />
              ) : (
                <p className="self-center text-sm text-muted-foreground">
                  No quedan rondas de cambios: apruébala o abre una disputa.
                </p>
              )}
            </>
          ) : null}

          {/* An approval that never moved on: the API checks the chain and pays. */}
          {active && (isStartup || isManager) && approvalStuck ? (
            <Button
              variant="outline"
              disabled={retryRelease.isPending}
              onClick={() => retryRelease.mutate()}
            >
              {retryRelease.isPending ? 'Revisando...' : '¿Sigue igual? Revisar de nuevo'}
            </Button>
          ) : null}

          {/* Approved but not paid yet: the release failed or is still confirming. */}
          {active && isSpecialist && milestone.status === 'approved' ? (
            <p className="text-sm text-muted-foreground">
              Aprobado. El pago se está liberando a tu wallet; aparecerá aquí como pagado
              cuando la red lo confirme.
            </p>
          ) : null}

          {active && (isStartup || isManager) && milestone.status === 'approved' ? (
            <Button
              variant="outline"
              disabled={retryRelease.isPending}
              onClick={() => retryRelease.mutate()}
            >
              {retryRelease.isPending ? 'Liberando...' : 'Reintentar el pago'}
            </Button>
          ) : null}

          {active &&
          (isStartup || isSpecialist) &&
          DISPUTABLE.includes(milestone.status) &&
          !approving ? (
            <OpenDisputeDialog
              contractId={contract.id}
              escrowId={contract.escrowId}
              milestoneId={milestone.id}
              disabled={approvalBusy}
            />
          ) : null}

          {lastDispute ? (
            <Button asChild variant="outline">
              <Link href={`/disputes/${lastDispute.id}`}>Ver disputa</Link>
            </Button>
          ) : null}
        </div>

        <MoneyStepStatus
          stage={money.stage}
          slow={money.slow}
          sending="Pocket confirma tu aprobación y libera el pago al experto."
        />
      </CardContent>
    </Card>
  );
}

/**
 * One delivered version: the link, the specialist's note and the results. An
 * older version shows what was asked on it as answered by the next one.
 */
function Version({
  deliverable,
  kpis,
  label,
  answeredBy,
}: {
  deliverable: Deliverable;
  kpis: JobKpi[];
  label: string;
  /** The version that answered the changes asked on this one. */
  answeredBy?: number;
}) {
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-navy">{label}</span>
        <a
          href={safeHref(deliverable.url)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 break-all underline"
        >
          {deliverable.url} <ExternalLinkIcon className="size-3 shrink-0" />
        </a>
        <span className="text-xs text-muted-foreground">{linkHost(deliverable.url)}</span>
        <span className="text-xs text-muted-foreground">
          {dateTime(deliverable.createdAt)}
        </span>
      </div>
      {deliverable.note ? (
        <p className="mt-1 whitespace-pre-line text-foreground/80">
          <span className="font-medium text-navy">Nota del experto: </span>
          {deliverable.note}
        </p>
      ) : null}
      <KpiReport kpis={kpis} deliverable={deliverable} />
      {deliverable.feedback && answeredBy ? (
        <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-muted px-2 py-1 text-muted-foreground">
          <CheckIcon className="mt-0.5 size-3.5 shrink-0" aria-label="Atendido" />
          <span>
            Cambios pedidos, atendidos en la versión {answeredBy}: {deliverable.feedback}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The result of one KPI in a delivery. A KPI with a numeric target takes a
 * number, shown against the target as it is typed, or that it cannot be
 * measured yet; a KPI that is only tracked takes free text.
 */
function KpiResultField({ kpi }: { kpi: JobKpi }) {
  const [value, setValue] = useState('');
  const [unmeasured, setUnmeasured] = useState(false);
  const numeric = kpi.targetValue !== null;

  return (
    <div className="space-y-1.5 rounded-xl bg-muted/50 p-3">
      <label htmlFor={`result-${kpi.id}`} className="block text-sm font-medium text-navy">
        {kpi.name}
        <span className="block text-xs font-normal text-muted-foreground">
          Meta: {kpiTarget(kpi)}
        </span>
      </label>
      {numeric ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={`result-${kpi.id}`}
              name={`result-${kpi.id}`}
              type="number"
              inputMode="decimal"
              step="any"
              required={!unmeasured}
              disabled={unmeasured}
              value={unmeasured ? '' : value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={kpi.unit ? `Resultado en ${kpi.unit}` : 'Resultado'}
              className="w-44"
            />
            {!unmeasured && value !== '' ? (
              <KpiOutcomeBadge {...kpiOutcome(kpi, value)} />
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name={`unmeasured-${kpi.id}`}
              checked={unmeasured}
              onChange={(event) => setUnmeasured(event.target.checked)}
            />
            Todavía no se puede medir
          </label>
        </>
      ) : (
        <Input
          id={`result-${kpi.id}`}
          name={`result-${kpi.id}`}
          required
          maxLength={120}
          placeholder='Resultado, por ejemplo 48, o "Todavía no se puede medir"'
        />
      )}
      <Input
        name={`comment-${kpi.id}`}
        maxLength={500}
        placeholder="Comentario (opcional)"
        aria-label={`Comentario sobre ${kpi.name}`}
      />
    </div>
  );
}

function DeliverDialog({
  contractId,
  milestoneId,
  kpis,
  jobId,
  reportTemplate,
  again = false,
}: {
  contractId: string;
  milestoneId: string;
  kpis: JobKpi[];
  jobId: string;
  reportTemplate: JobReportTemplate | null;
  /** A new version after the startup asked for changes. */
  again?: boolean;
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
          `Entregado, pero el archivo no se subió: ${errorMessage(error)}. Vuelve a adjuntarlo desde el hito.`,
        );
      }
    },
    'Entrega enviada. La startup la revisará.',
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
              // A numeric target takes a number, or that it is not measurable yet.
              ...(kpi.targetValue === null
                ? { value: values[`result-${kpi.id}`] }
                : values[`unmeasured-${kpi.id}`]
                  ? { notMeasurable: true }
                  : { number: Number(values[`result-${kpi.id}`]) }),
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
        <Button>{again ? 'Entregar nueva versión' : 'Entregar'}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {again ? 'Entregar una nueva versión' : 'Entregar este hito'}
          </DialogTitle>
          <DialogDescription>
            {again
              ? 'Comparte el enlace a la versión con los cambios que pidió la startup.'
              : 'Comparte un enlace al trabajo: un documento, carpeta, reporte o campaña.'}
            {kpis.length > 0
              ? ' Luego indica cómo va cada KPI, para que la startup pueda compararlo con la meta.'
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            name="url"
            type="url"
            pattern="https://.+"
            title="Un enlace que empiece con https://"
            required
            placeholder="https://"
            aria-label="Enlace al trabajo"
          />
          <Textarea
            name="note"
            maxLength={2000}
            placeholder={
              again
                ? 'Qué cambiaste en esta versión (opcional)'
                : 'Una nota para la startup (opcional)'
            }
            aria-label="Nota para la startup"
          />

          {kpis.length > 0 ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-navy">Resultados</legend>
              {kpis.map((kpi) => (
                <KpiResultField key={kpi.id} kpi={kpi} />
              ))}
            </fieldset>
          ) : null}

          <div className="space-y-1">
            <label htmlFor="attachment" className="block text-sm font-medium text-navy">
              Un archivo que lo respalde (opcional)
            </label>
            {reportTemplate ? (
              <div className="space-y-2 rounded-xl bg-celeste-light/40 p-3 text-sm">
                <p>
                  La startup pidió su plantilla de reporte: descárgala, complétala y
                  adjúntala aquí.
                </p>
                <ReportTemplateButton jobId={jobId} template={reportTemplate} />
              </div>
            ) : null}
            <Input
              id="attachment"
              type="file"
              accept={ATTACHMENT_ACCEPT}
              onChange={onFileChosen}
            />
            <p className="text-xs text-muted-foreground">
              Una plantilla de reporte completa, un PDF o una captura de pantalla: Excel
              (.xlsx), Word (.docx), CSV, PDF, PNG, JPEG o WebP, hasta 5 MB. Solo la
              startup y los managers de Pocket pueden abrirlo.
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={deliver.isPending}>
              {deliver.isPending ? 'Enviando...' : 'Enviar entrega'}
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
  disabled = false,
}: {
  contractId: string;
  milestoneId: string;
  /** While the payment is being approved. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const request = useContractAction(
    contractId,
    (feedback: string) =>
      api(`/milestones/${milestoneId}/request-changes`, {
        method: 'POST',
        body: { feedback },
      }),
    'Entrega devuelta al experto',
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
        <Button variant="outline" disabled={disabled}>
          Pedir cambios
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pedir cambios</DialogTitle>
          <DialogDescription>
            El experto verá tu nota y entregará una nueva versión.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Textarea
            name="feedback"
            required
            minLength={5}
            maxLength={2000}
            placeholder="Qué debería cambiar"
          />
          <DialogFooter>
            <Button type="submit" disabled={request.isPending}>
              Enviar
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
  disabled = false,
}: {
  contractId: string;
  escrowId: string | null;
  milestoneId: string;
  /** While the payment is being approved. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const signer = useSigner();
  const money = useMoneyStep();
  // The reason travels with the signed transaction, so this does not use prepareSignSubmit.
  const dispute = useContractAction(
    contractId,
    async (reason: string) => {
      try {
        money.onStage('preparing');
        const prepared = await api<PreparedTransaction>(
          `/milestones/${milestoneId}/dispute/prepare`,
          { method: 'POST' },
        );
        money.onStage('signing');
        const signedXdr = await signer.sign(prepared.xdr, prepared.networkPassphrase, {
          kind: 'dispute',
          escrowId,
        });
        money.onStage('sending');
        return await api(`/milestones/${milestoneId}/dispute`, {
          method: 'POST',
          body: { signedXdr, reason },
        });
      } finally {
        money.done();
      }
    },
    'Disputa abierta. Un manager la revisará.',
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
        <Button variant="destructive" disabled={disabled}>
          Abrir una disputa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir una disputa</DialogTitle>
          <DialogDescription>
            El dinero de este hito queda congelado en el contrato hasta que un manager de
            Pocket decida: pagarle al experto, devolvérselo a la startup o repartirlo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Textarea
            name="reason"
            required
            minLength={10}
            maxLength={2000}
            placeholder="Qué salió mal"
            rows={4}
          />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={dispute.isPending}>
              {money.stage
                ? stageLabel(money.stage, 'Abriendo la disputa...')
                : 'Firmar y abrir la disputa'}
            </Button>
          </DialogFooter>
          <MoneyStepStatus
            stage={money.stage}
            slow={money.slow}
            sending="Pocket registra la disputa en el contrato."
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
import { ExternalLinkIcon } from 'lucide-react';
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
import { ReportTemplateButton } from '@/components/report-template';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage, upload } from '@/lib/api';
import { ON_MAINNET } from '@/lib/network';
import { ATTACHMENT_ACCEPT } from '@/lib/files';
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
  const confirm = useConfirm();

  const approve = useContractAction(
    contract.id,
    () =>
      prepareSignSubmit(
        signer.sign,
        { kind: 'approve', escrowId: contract.escrowId },
        `/milestones/${milestone.id}/approve/prepare`,
        `/milestones/${milestone.id}/approve/submit`,
      ),
    'Aprobado. El pago se liberó al experto.',
  );
  const retryRelease = useContractAction(
    contract.id,
    () => api(`/milestones/${milestone.id}/release`, { method: 'POST' }),
    'Pago liberado',
  );

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hito {milestone.position + 1} · fecha de entrega: {date(milestone.dueDate)}
            </p>
            <h3 className="mt-1 font-heading text-lg font-semibold text-navy">
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
            {milestone.revisionsUsed > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {milestone.revisionsUsed} de {contract.job.revisionRounds} rondas de
                cambios usadas.
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
                      Versión {deliverable.version}
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
                      Cambios pedidos: {deliverable.feedback}
                    </p>
                  ) : null}
                </div>
              ))}
          </div>
        ) : null}

        {lastDispute?.status === 'resolved' ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            Disputa resuelta por un manager: {usdc(lastDispute.specialistAmount)} para el
            experto y {usdc(lastDispute.startupAmount)} de vuelta a la startup.
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
              jobId={contract.job.id}
              reportTemplate={contract.job.reportTemplate}
            />
          ) : null}

          {active && isSpecialist && milestone.status === 'delivered' && latest ? (
            <AttachFileButton contractId={contract.id} deliverable={latest} />
          ) : null}

          {active && isStartup && milestone.status === 'delivered' ? (
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
                {approve.isPending ? 'Esperando tu wallet...' : 'Aprobar y pagar'}
              </Button>
              {roundsLeft ? (
                <RequestChangesDialog
                  contractId={contract.id}
                  milestoneId={milestone.id}
                />
              ) : (
                <p className="self-center text-sm text-muted-foreground">
                  No quedan rondas de cambios: apruébala o abre una disputa.
                </p>
              )}
            </>
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
          DISPUTABLE.includes(milestone.status) ? (
            <OpenDisputeDialog
              contractId={contract.id}
              escrowId={contract.escrowId}
              milestoneId={milestone.id}
            />
          ) : null}

          {lastDispute ? (
            <Button asChild variant="outline">
              <Link href={`/disputes/${lastDispute.id}`}>Ver disputa</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
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
}: {
  contractId: string;
  milestoneId: string;
  kpis: JobKpi[];
  jobId: string;
  reportTemplate: JobReportTemplate | null;
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
        <Button>Entregar</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Entregar este hito</DialogTitle>
          <DialogDescription>
            Comparte un enlace al trabajo: un documento, carpeta, reporte o campaña.
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
            placeholder="Una nota para la startup (opcional)"
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
        <Button variant="outline">Pedir cambios</Button>
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
        <Button variant="destructive">Abrir una disputa</Button>
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
              {dispute.isPending ? 'Esperando tu wallet...' : 'Firmar y abrir la disputa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

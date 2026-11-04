import { afterFees, type ChainOperationKind, type ContractDetail } from '@pocket/shared';
import { ExternalLinkIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { dateTime, explorerTx, usdc } from '@/lib/format';

interface HistoryEvent {
  at: string;
  /** False when Pocket did not record the time: placed by the event it answers. */
  timed: boolean;
  text: string;
  detail?: string | null;
  txHash?: string;
}

/**
 * Everything that happened in a contract, in order, in plain words: what each
 * side did and every movement of money, with the network receipt as a
 * secondary link. Built from records that are only ever added to.
 */
export function WorkHistory({
  contract,
  startupName,
  specialistName,
}: {
  contract: ContractDetail;
  startupName: string;
  specialistName: string;
}) {
  const events = historyOf(contract, startupName, specialistName);
  if (events.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl font-bold text-navy">Historial del trabajo</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Todo lo que pasó en este contrato, en orden. Nada de esto se puede editar ni
        borrar.
      </p>
      <Card>
        <CardContent className="pt-2">
          <ol className="divide-y divide-border">
            {events.map((event, index) => (
              <li
                key={`${event.at}-${index}`}
                className="flex flex-col gap-1 py-3 text-sm md:flex-row md:items-start md:justify-between md:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-navy">{event.text}</p>
                  {event.detail ? (
                    <p className="mt-0.5 whitespace-pre-line text-foreground/80">
                      {event.detail}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
                  <span>{event.timed ? dateTime(event.at) : 'Sin hora registrada'}</span>
                  {event.txHash ? (
                    <a
                      href={explorerTx(event.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs underline"
                    >
                      Ver comprobante <ExternalLinkIcon className="size-3" />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}

function historyOf(
  contract: ContractDetail,
  startupName: string,
  specialistName: string,
): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const add = (
    at: string | null | undefined,
    text: string,
    extra: Partial<HistoryEvent> = {},
  ) => {
    if (at) events.push({ at, timed: true, text, ...extra });
  };
  const milestoneOf = (id: string | null) =>
    contract.milestones.find((milestone) => milestone.id === id);
  // "hito 2, «Title»": each sentence adds its own article ("el", "del").
  const named = (id: string | null) => {
    const milestone = milestoneOf(id);
    return milestone ? `hito ${milestone.position + 1}, «${milestone.title}»` : 'hito';
  };

  add(contract.createdAt, `${startupName} envió los términos a ${specialistName}`);
  add(contract.acceptedAt, `${specialistName} aceptó los términos`);

  // Every movement on the network, with its receipt.
  const onChain: Record<
    ChainOperationKind,
    ((op: ContractDetail['chainOperations'][number]) => void) | null
  > = {
    deploy: (op) =>
      add(op.confirmedAt, 'Se creó el pago protegido', { txHash: op.txHash }),
    fund: (op) =>
      add(
        op.confirmedAt,
        `${startupName} depositó ${usdc(op.amount ?? contract.amount)}`,
        {
          txHash: op.txHash,
        },
      ),
    approve: (op) =>
      add(op.confirmedAt, `${startupName} aprobó el ${named(op.milestoneId)}`, {
        txHash: op.txHash,
      }),
    release: (op) =>
      add(op.confirmedAt, `Se liberó el pago del ${named(op.milestoneId)}`, {
        detail: releasedDetail(op.amount ?? milestoneOf(op.milestoneId)?.amount),
        txHash: op.txHash,
      }),
    dispute: (op) => {
      const dispute = milestoneOf(op.milestoneId)?.disputes.at(-1);
      add(op.confirmedAt, `Se abrió una disputa sobre el ${named(op.milestoneId)}`, {
        detail: dispute ? `Motivo: ${dispute.reason}` : null,
        txHash: op.txHash,
      });
    },
    resolve: (op) => {
      const dispute = milestoneOf(op.milestoneId)?.disputes.findLast(
        (each) => each.status === 'resolved',
      );
      add(
        op.confirmedAt,
        `Un manager de Pocket resolvió la disputa sobre el ${named(op.milestoneId)}`,
        {
          detail: dispute
            ? `${usdc(dispute.specialistAmount)} para el experto y ${usdc(dispute.startupAmount)} de vuelta a la startup.${dispute.resolutionNote ? ` «${dispute.resolutionNote}»` : ''}`
            : null,
          txHash: op.txHash,
        },
      );
    },
    // Not part of a contract.
    trustline: null,
    payment: null,
  };
  for (const op of contract.chainOperations) onChain[op.kind]?.(op);
  if (contract.fundedAt && !contract.chainOperations.some((op) => op.kind === 'fund')) {
    add(contract.fundedAt, `${startupName} depositó ${usdc(contract.amount)}`);
  }

  // Deliveries and the changes asked on each.
  for (const milestone of contract.milestones) {
    for (const deliverable of milestone.deliverables) {
      add(
        deliverable.createdAt,
        `${specialistName} entregó la versión ${deliverable.version} del ${named(milestone.id)}`,
        { detail: deliverable.note },
      );
      if (deliverable.feedback) {
        events.push({
          at: deliverable.feedbackAt ?? deliverable.createdAt,
          timed: Boolean(deliverable.feedbackAt),
          text: `${startupName} pidió cambios en la versión ${deliverable.version} del ${named(milestone.id)}`,
          detail: deliverable.feedback,
        });
      }
    }
  }

  add(contract.cancelledAt, 'Se canceló el contrato');
  add(contract.completedAt, 'Contrato completado');

  // Same instant: keep the order the events were added in, which follows the flow.
  return events
    .map((event, order) => ({ event, order }))
    .sort((a, b) => a.event.at.localeCompare(b.event.at) || a.order - b.order)
    .map(({ event }) => event);
}

/** A released payment, and what reached the specialist after both fees. */
function releasedDetail(amount: string | null | undefined): string | null {
  if (!amount) return null;
  return `${usdc(amount)}: ${usdc(afterFees(amount))} para el experto, después de comisiones.`;
}

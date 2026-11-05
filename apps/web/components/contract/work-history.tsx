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

interface HistoryGroup {
  title: string;
  events: HistoryEvent[];
}

/**
 * Everything that happened in a contract, in plain words: what each side did
 * and every movement of money, with the network receipt as a secondary link.
 * Split into the start, each milestone and the close, each one in date order,
 * so work on two milestones at once does not read as one tangled list. Built
 * from records that are only ever added to.
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
  const groups = historyOf(contract, startupName, specialistName);
  if (groups.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl font-bold text-navy">Historial del trabajo</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Todo lo que pasó en este contrato, hito por hito y en orden de fecha. Nada de esto
        se puede editar ni borrar.
      </p>
      <div className="space-y-3">
        {groups.map((group) => (
          <Card key={group.title}>
            <CardContent>
              <h3 className="font-semibold break-words text-navy">{group.title}</h3>
              <ol className="mt-1 divide-y divide-border">
                {group.events.map((event, index) => (
                  <li
                    key={`${event.at}-${index}`}
                    className="flex flex-col gap-1 py-3 text-sm last:pb-0 md:flex-row md:items-start md:justify-between md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-navy">{event.text}</p>
                      {event.detail ? (
                        <p className="mt-0.5 break-words whitespace-pre-line text-foreground/80">
                          {event.detail}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
                      <span>
                        {event.timed ? dateTime(event.at) : 'Sin hora registrada'}
                      </span>
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
        ))}
      </div>
    </section>
  );
}

function historyOf(
  contract: ContractDetail,
  startupName: string,
  specialistName: string,
): HistoryGroup[] {
  const start: HistoryEvent[] = [];
  const close: HistoryEvent[] = [];
  const byMilestone = new Map<string, HistoryEvent[]>(
    contract.milestones.map((milestone) => [milestone.id, []]),
  );
  const milestoneOf = (id: string | null) =>
    contract.milestones.find((milestone) => milestone.id === id);
  // A step on a milestone goes under it; anything else belongs to the contract.
  const groupOf = (id: string | null) => (id && byMilestone.get(id)) || start;
  const add = (
    group: HistoryEvent[],
    at: string | null | undefined,
    text: string,
    extra: Partial<HistoryEvent> = {},
  ) => {
    if (at) group.push({ at, timed: true, text, ...extra });
  };

  add(start, contract.createdAt, `${startupName} envió los términos a ${specialistName}`);
  add(start, contract.acceptedAt, `${specialistName} aceptó los términos`);

  // Every movement on the network, with its receipt.
  const onChain: Record<
    ChainOperationKind,
    ((op: ContractDetail['chainOperations'][number]) => void) | null
  > = {
    deploy: (op) =>
      add(start, op.confirmedAt, 'Se creó el pago protegido', { txHash: op.txHash }),
    fund: (op) =>
      add(
        start,
        op.confirmedAt,
        `${startupName} depositó ${usdc(op.amount ?? contract.amount)}`,
        { txHash: op.txHash },
      ),
    approve: (op) =>
      add(groupOf(op.milestoneId), op.confirmedAt, `${startupName} aprobó el hito`, {
        txHash: op.txHash,
      }),
    release: (op) =>
      add(groupOf(op.milestoneId), op.confirmedAt, 'Se liberó el pago', {
        detail: releasedDetail(op.amount ?? milestoneOf(op.milestoneId)?.amount),
        txHash: op.txHash,
      }),
    dispute: (op) => {
      const dispute = milestoneOf(op.milestoneId)?.disputes.at(-1);
      add(groupOf(op.milestoneId), op.confirmedAt, 'Se abrió una disputa', {
        detail: dispute ? `Motivo: ${dispute.reason}` : null,
        txHash: op.txHash,
      });
    },
    resolve: (op) => {
      const dispute = milestoneOf(op.milestoneId)?.disputes.findLast(
        (each) => each.status === 'resolved',
      );
      add(
        groupOf(op.milestoneId),
        op.confirmedAt,
        'Un manager de Pocket resolvió la disputa',
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
    add(start, contract.fundedAt, `${startupName} depositó ${usdc(contract.amount)}`);
  }

  // Deliveries and the changes asked on each.
  for (const milestone of contract.milestones) {
    const group = groupOf(milestone.id);
    for (const deliverable of milestone.deliverables) {
      add(
        group,
        deliverable.createdAt,
        `${specialistName} entregó la versión ${deliverable.version}`,
        { detail: deliverable.note },
      );
      if (deliverable.feedback) {
        group.push({
          at: deliverable.feedbackAt ?? deliverable.createdAt,
          timed: Boolean(deliverable.feedbackAt),
          text: `${startupName} pidió cambios en la versión ${deliverable.version}`,
          detail: deliverable.feedback,
        });
      }
    }
  }

  add(close, contract.cancelledAt, 'Se canceló el contrato');
  add(close, contract.completedAt, 'Contrato completado');

  return [
    { title: 'Inicio del contrato', events: inOrder(start) },
    ...contract.milestones.map((milestone) => ({
      title: `Hito ${milestone.position + 1}: ${milestone.title}`,
      events: inOrder(groupOf(milestone.id)),
    })),
    { title: 'Cierre del contrato', events: inOrder(close) },
  ].filter((group) => group.events.length > 0);
}

/** Oldest first. Same instant: the order they were added in, which follows the flow. */
function inOrder(events: HistoryEvent[]): HistoryEvent[] {
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

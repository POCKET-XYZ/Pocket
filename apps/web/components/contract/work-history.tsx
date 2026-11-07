'use client';

import { afterFees, type ChainOperationKind, type ContractDetail } from '@pocket/shared';
import {
  BanknoteIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FlagIcon,
  LockIcon,
  MessageSquareIcon,
  ScaleIcon,
  ThumbsUpIcon,
  UploadIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { dateTime, explorerTx, usdc } from '@/lib/format';
import { cn } from '@/lib/utils';

/** What each kind of event looks like: an icon and words, never color alone. */
const LOOKS = {
  neutral: { icon: FileTextIcon, tone: 'bg-celeste-light/70 text-navy' },
  accepted: { icon: CheckIcon, tone: 'bg-celeste-light/70 text-navy' },
  protected: { icon: LockIcon, tone: 'bg-celeste-light/70 text-navy' },
  delivery: { icon: UploadIcon, tone: 'bg-celeste-light/70 text-navy' },
  changes: { icon: MessageSquareIcon, tone: 'bg-warning/40 text-navy' },
  approved: { icon: ThumbsUpIcon, tone: 'bg-emerald-100 text-emerald-800' },
  money: { icon: BanknoteIcon, tone: 'bg-emerald-100 text-emerald-800' },
  dispute: { icon: ScaleIcon, tone: 'bg-red-100 text-red-800' },
  finished: { icon: FlagIcon, tone: 'bg-navy text-off-white' },
  cancelled: { icon: XIcon, tone: 'bg-muted text-muted-foreground' },
} satisfies Record<string, { icon: LucideIcon; tone: string }>;

type Look = keyof typeof LOOKS;

interface HistoryEvent {
  at: string;
  /** False when Pocket did not record the time: placed by the event it answers. */
  timed: boolean;
  look: Look;
  text: string;
  detail?: string | null;
  /** Money that moved, shown apart so it can be found at a glance. */
  amount?: string | null;
  txHash?: string;
}

interface HistoryGroup {
  id: string;
  title: string;
  /** The status a milestone is in; a part of the contract has none. */
  status?: string;
  events: HistoryEvent[];
}

/**
 * Everything that happened in a contract: what each side did and every movement
 * of money, with the network receipt as a secondary link. One line per part of
 * the contract, and only the part under way open, so the record stays complete
 * without having to read all of it. Built from records only ever added to.
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
  const [opened, setOpened] = useState<Set<string>>(() => openFirst(contract, groups));
  if (groups.length === 0) return null;

  const allOpen = groups.every((group) => opened.has(group.id));
  const toggle = (id: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy">Historial del trabajo</h2>
          <p className="text-sm text-muted-foreground">
            Todo lo que pasó, hito por hito. Nada de esto se puede editar ni borrar.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setOpened(allOpen ? new Set() : new Set(groups.map((group) => group.id)))
          }
          className="shrink-0 text-sm text-muted-foreground underline hover:text-navy"
        >
          {allOpen ? 'Plegar todo' : 'Ver todo'}
        </button>
      </div>
      <div className="space-y-2">
        {groups.map((group) => {
          const open = opened.has(group.id);
          return (
            <div key={group.id} className="rounded-2xl border border-border bg-card">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(group.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <ChevronRightIcon
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform',
                    open && 'rotate-90',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 font-semibold break-words text-navy">
                  {group.title}
                </span>
                {group.status ? <StatusBadge status={group.status} /> : null}
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {group.events.length === 1
                    ? '1 movimiento'
                    : `${group.events.length} movimientos`}
                </span>
              </button>
              {open ? (
                <ol className="px-4 pb-4">
                  {group.events.map((event, index) => (
                    <EventRow
                      key={`${event.at}-${index}`}
                      event={event}
                      last={index === group.events.length - 1}
                    />
                  ))}
                </ol>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** A line on the timeline: what happened, when, and its receipt. */
function EventRow({ event, last }: { event: HistoryEvent; last: boolean }) {
  const { icon: Icon, tone } = LOOKS[event.look];
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {last ? null : (
        <span
          className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-border"
          aria-hidden
        />
      )}
      <span
        className={cn(
          'relative flex size-8 shrink-0 items-center justify-center rounded-full',
          tone,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-1 text-sm">
        <div className="flex flex-col gap-x-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="min-w-0 font-medium break-words text-navy">{event.text}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {event.timed ? dateTime(event.at) : 'Sin hora registrada'}
          </span>
        </div>
        {event.amount ? (
          <p className="mt-1 w-fit rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            {event.amount}
          </p>
        ) : null}
        {event.detail ? <Detail text={event.detail} /> : null}
        {event.txHash ? (
          <a
            href={explorerTx(event.txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline"
          >
            Ver comprobante <ExternalLinkIcon className="size-3" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

/** A long note stays short until asked for: it is there, without being in the way. */
function Detail({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 140 || text.includes('\n');
  return (
    <div className="mt-1">
      <p
        className={cn(
          'break-words whitespace-pre-line text-foreground/80',
          long && !expanded && 'line-clamp-2',
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground underline hover:text-navy"
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      ) : null}
    </div>
  );
}

/** The part under way starts open; a finished contract starts as a clean summary. */
function openFirst(contract: ContractDetail, groups: HistoryGroup[]): Set<string> {
  const current = contract.milestones.find(
    (milestone) =>
      !['paid', 'resolved'].includes(milestone.status) &&
      groups.some((group) => group.id === milestone.id),
  );
  if (current) return new Set([current.id]);
  // Nothing delivered yet: what has happened so far is the start.
  if (contract.status !== 'completed' && contract.status !== 'cancelled') {
    return new Set(groups.slice(-1).map((group) => group.id));
  }
  return new Set();
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
    look: Look,
    text: string,
    extra: Partial<HistoryEvent> = {},
  ) => {
    if (at) group.push({ at, timed: true, look, text, ...extra });
  };

  add(
    start,
    contract.createdAt,
    'neutral',
    `${startupName} envió los términos a ${specialistName}`,
  );
  add(start, contract.acceptedAt, 'accepted', `${specialistName} aceptó los términos`);

  // Every movement on the network, with its receipt.
  const onChain: Record<
    ChainOperationKind,
    ((op: ContractDetail['chainOperations'][number]) => void) | null
  > = {
    deploy: (op) =>
      add(start, op.confirmedAt, 'protected', 'Se creó el pago protegido', {
        txHash: op.txHash,
      }),
    fund: (op) =>
      add(start, op.confirmedAt, 'money', `${startupName} depositó el pago`, {
        amount: usdc(op.amount ?? contract.amount),
        txHash: op.txHash,
      }),
    approve: (op) =>
      add(
        groupOf(op.milestoneId),
        op.confirmedAt,
        'approved',
        `${startupName} aprobó el hito`,
        { txHash: op.txHash },
      ),
    release: (op) => {
      const amount = op.amount ?? milestoneOf(op.milestoneId)?.amount;
      add(groupOf(op.milestoneId), op.confirmedAt, 'money', 'Se liberó el pago', {
        amount: amount ? `${usdc(afterFees(amount))} para el experto` : null,
        detail: amount ? `De ${usdc(amount)}, después de comisiones.` : null,
        txHash: op.txHash,
      });
    },
    dispute: (op) => {
      const dispute = milestoneOf(op.milestoneId)?.disputes.at(-1);
      add(groupOf(op.milestoneId), op.confirmedAt, 'dispute', 'Se abrió una disputa', {
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
        'dispute',
        'Un manager de Pocket resolvió la disputa',
        {
          amount: dispute ? `${usdc(dispute.specialistAmount)} para el experto` : null,
          detail: dispute
            ? `${usdc(dispute.startupAmount)} de vuelta a la startup.${dispute.resolutionNote ? ` «${dispute.resolutionNote}»` : ''}`
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
    add(start, contract.fundedAt, 'money', `${startupName} depositó el pago`, {
      amount: usdc(contract.amount),
    });
  }

  // Deliveries and the changes asked on each.
  for (const milestone of contract.milestones) {
    const group = groupOf(milestone.id);
    for (const deliverable of milestone.deliverables) {
      add(
        group,
        deliverable.createdAt,
        'delivery',
        `${specialistName} entregó la versión ${deliverable.version}`,
        { detail: deliverable.note },
      );
      if (deliverable.feedback) {
        group.push({
          at: deliverable.feedbackAt ?? deliverable.createdAt,
          timed: Boolean(deliverable.feedbackAt),
          look: 'changes',
          text: `${startupName} pidió cambios en la versión ${deliverable.version}`,
          detail: deliverable.feedback,
        });
      }
    }
  }

  add(close, contract.cancelledAt, 'cancelled', 'Se canceló el contrato');
  add(close, contract.completedAt, 'finished', 'Contrato completado');

  return [
    { id: 'start', title: 'Inicio del contrato', events: inOrder(start) },
    ...contract.milestones.map((milestone) => ({
      id: milestone.id,
      title: `Hito ${milestone.position + 1}: ${milestone.title}`,
      status: milestone.status,
      events: inOrder(groupOf(milestone.id)),
    })),
    { id: 'close', title: 'Cierre del contrato', events: inOrder(close) },
  ].filter((group) => group.events.length > 0);
}

/** Oldest first. Same instant: the order they were added in, which follows the flow. */
function inOrder(events: HistoryEvent[]): HistoryEvent[] {
  return events
    .map((event, order) => ({ event, order }))
    .sort((a, b) => a.event.at.localeCompare(b.event.at) || a.order - b.order)
    .map(({ event }) => event);
}

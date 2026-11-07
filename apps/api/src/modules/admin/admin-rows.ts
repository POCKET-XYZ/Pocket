import type {
  AdminContractCheck,
  AdminContractRow,
  AdminFlag,
  AdminOverview,
} from '@pocket/shared';
import { Prisma } from '@prisma/client';
import { endOfDayAnywhere } from '../contracts/report';
import type { ChainEscrow } from '../stellar/soroban-reader.service';
import { chainCheckOf, fromStroops, toStroops, type Credit } from '../stats/traction';

/** What the admin's contract rows and checks are built from. */
export const ADMIN_CONTRACT_INCLUDE = {
  job: { select: { title: true, category: true } },
  startup: {
    select: {
      id: true,
      stellarAddress: true,
      startupProfile: { select: { companyName: true } },
    },
  },
  specialist: {
    select: {
      id: true,
      stellarAddress: true,
      specialistProfile: { select: { displayName: true } },
    },
  },
  milestones: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      title: true,
      amount: true,
      status: true,
      dueDate: true,
      approvedAt: true,
      paidAt: true,
      deliverables: { orderBy: { version: 'asc' }, select: { createdAt: true } },
      disputes: { select: { status: true, createdAt: true } },
    },
  },
  chainOperations: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      kind: true,
      status: true,
      txHash: true,
      milestoneId: true,
      signerId: true,
      error: true,
      createdAt: true,
      confirmedAt: true,
      payoutsReadAt: true,
      payouts: { select: { recipient: true, amount: true } },
    },
  },
} satisfies Prisma.ContractInclude;

export type AdminContractSource = Prisma.ContractGetPayload<{
  include: typeof ADMIN_CONTRACT_INCLUDE;
}>;

const ZERO = new Prisma.Decimal(0);
const sum = (values: Prisma.Decimal[]) =>
  values.reduce((total, value) => total.plus(value), ZERO);
const DONE = ['paid', 'resolved'];
const TO_DELIVER = ['pending', 'changes_requested'];

/** Milestones whose date passed, everywhere, with nothing delivered. */
function overdueOf(source: AdminContractSource, now: Date) {
  if (source.status !== 'active') return [];
  return source.milestones.filter(
    (milestone) =>
      TO_DELIVER.includes(milestone.status) && now > endOfDayAnywhere(milestone.dueDate),
  );
}

/** A release or resolution that landed, with its split still not read from Stellar. */
function unreadPayments(source: AdminContractSource) {
  return source.chainOperations.filter(
    (operation) =>
      operation.status === 'confirmed' &&
      (operation.kind === 'release' || operation.kind === 'resolve') &&
      !operation.payoutsReadAt,
  );
}

/** Steps that failed and were never done afterwards. */
function failedSteps(source: AdminContractSource) {
  return source.chainOperations.filter(
    (operation, index) =>
      operation.status === 'failed' &&
      !source.chainOperations
        .slice(index + 1)
        .some(
          (later) =>
            later.status === 'confirmed' &&
            later.kind === operation.kind &&
            later.milestoneId === operation.milestoneId,
        ),
  );
}

function flagsOf(source: AdminContractSource, now: Date): AdminFlag[] {
  const flags: AdminFlag[] = [];
  if (source.milestones.some((m) => m.disputes.some((d) => d.status === 'open'))) {
    flags.push('dispute');
  }
  if (overdueOf(source, now).length > 0) flags.push('overdue');
  if (
    source.status === 'active' &&
    source.milestones.some((m) => m.status === 'delivered')
  ) {
    flags.push('to_review');
  }
  if (source.status === 'awaiting_funding') flags.push('awaiting_funding');
  if (unreadPayments(source).length > 0) flags.push('unread_payment');
  if (failedSteps(source).length > 0) flags.push('failed_step');
  return flags;
}

function moneyOf(source: AdminContractSource) {
  const deposited = source.fundedAt ? source.amount : ZERO;
  const released = sum(
    source.milestones.filter((m) => DONE.includes(m.status)).map((m) => m.amount),
  );
  return {
    amount: source.amount.toString(),
    deposited: deposited.toString(),
    released: released.toString(),
    inEscrow: Prisma.Decimal.max(deposited.minus(released), ZERO).toString(),
  };
}

const latest = (dates: (Date | null | undefined)[]) =>
  new Date(
    Math.max(...dates.filter((d): d is Date => Boolean(d)).map((d) => d.getTime())),
  );

/** One contract as a line of the admin's list. */
export function contractRow(source: AdminContractSource, now: Date): AdminContractRow {
  const toDeliver =
    source.status === 'active'
      ? source.milestones.filter((m) => TO_DELIVER.includes(m.status))
      : [];
  return {
    id: source.id,
    jobTitle: source.job.title,
    category: source.job.category,
    status: source.status,
    startup: {
      id: source.startup.id,
      name: source.startup.startupProfile?.companyName ?? null,
    },
    specialist: {
      id: source.specialist.id,
      name: source.specialist.specialistProfile?.displayName ?? null,
    },
    escrowId: source.escrowId,
    ...moneyOf(source),
    milestones: {
      total: source.milestones.length,
      done: source.milestones.filter((m) => DONE.includes(m.status)).length,
      delivered: source.milestones.filter((m) => m.status === 'delivered').length,
      overdue: overdueOf(source, now).length,
      disputed: source.milestones.filter((m) => m.status === 'disputed').length,
    },
    nextDue:
      toDeliver
        .map((m) => m.dueDate)
        .sort((a, b) => a.getTime() - b.getTime())[0]
        ?.toISOString() ?? null,
    createdAt: source.createdAt.toISOString(),
    lastActivityAt: latest([
      source.createdAt,
      source.acceptedAt,
      source.fundedAt,
      source.completedAt,
      source.cancelledAt,
      ...source.milestones.flatMap((m) => [
        m.approvedAt,
        m.paidAt,
        ...m.deliverables.map((d) => d.createdAt),
        ...m.disputes.map((d) => d.createdAt),
      ]),
      ...source.chainOperations.flatMap((op) => [op.createdAt, op.confirmedAt]),
    ]).toISOString(),
    flags: flagsOf(source, now),
  };
}

const day = (date: Date) =>
  date.toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Everything that needs a look across the contracts, the oldest first. */
export function attentionOf(
  sources: AdminContractSource[],
  now: Date,
): AdminOverview['attention'] {
  const items: AdminOverview['attention'] = [];
  for (const source of sources) {
    const base = { contractId: source.id, jobTitle: source.job.title };
    for (const milestone of source.milestones) {
      const open = milestone.disputes.find((d) => d.status === 'open');
      if (open) {
        items.push({
          ...base,
          flag: 'dispute',
          detail: `Disputa abierta en el hito ${milestone.position + 1}`,
          since: open.createdAt.toISOString(),
        });
      }
    }
    for (const milestone of overdueOf(source, now)) {
      items.push({
        ...base,
        flag: 'overdue',
        detail: `El hito ${milestone.position + 1} venció el ${day(milestone.dueDate)} sin entrega`,
        since: milestone.dueDate.toISOString(),
      });
    }
    if (source.status === 'active') {
      for (const milestone of source.milestones.filter((m) => m.status === 'delivered')) {
        items.push({
          ...base,
          flag: 'to_review',
          detail: `El hito ${milestone.position + 1} está entregado y espera a la startup`,
          since: (
            milestone.deliverables.at(-1)?.createdAt ?? source.createdAt
          ).toISOString(),
        });
      }
    }
    if (source.status === 'awaiting_funding') {
      items.push({
        ...base,
        flag: 'awaiting_funding',
        detail: 'El experto aceptó y falta el depósito de la startup',
        since: (source.acceptedAt ?? source.createdAt).toISOString(),
      });
    }
    for (const operation of unreadPayments(source)) {
      items.push({
        ...base,
        flag: 'unread_payment',
        detail: 'Un pago sin su desglose leído de Stellar',
        since: (operation.confirmedAt ?? operation.createdAt).toISOString(),
      });
    }
    for (const operation of failedSteps(source)) {
      items.push({
        ...base,
        flag: 'failed_step',
        detail: `Falló un paso en la red (${operation.kind}) y no se volvió a hacer`,
        since: operation.createdAt.toISOString(),
      });
    }
  }
  return items.sort((a, b) => a.since.localeCompare(b.since));
}

/** USDC a payment's transaction moved out of the escrow, to whom. */
export interface PaymentOnChain {
  txHash: string;
  transfers: { to: string; amount: string }[] | null;
}

/**
 * One contract against its escrow on chain: the escrow is there and is
 * Pocket's, it got the deposit, each milestone's amount and state match, and
 * each payment's transaction moved exactly what its milestone held.
 */
export function contractCheckOf(
  source: AdminContractSource,
  onChain: { escrow: ChainEscrow | null; balance: bigint } | null,
  payments: PaymentOnChain[],
  platforms: Set<string>,
  now: Date,
): AdminContractCheck {
  const escrow = onChain?.escrow ?? null;
  const byTx = new Map(payments.map((payment) => [payment.txHash, payment.transfers]));
  const positionOf = new Map(source.milestones.map((m) => [m.id, m.position]));

  const paid = source.chainOperations.filter(
    (op) => op.status === 'confirmed' && (op.kind === 'release' || op.kind === 'resolve'),
  );
  const paymentRows = paid.flatMap((op) => {
    const milestone = source.milestones.find((m) => m.id === op.milestoneId);
    if (!milestone) return [];
    const transfers = byTx.get(op.txHash) ?? null;
    const moved = transfers
      ? transfers.reduce((total, transfer) => total + toStroops(transfer.amount), 0n)
      : null;
    return [
      {
        milestonePosition: milestone.position,
        kind: op.kind as 'release' | 'resolve',
        txHash: op.txHash,
        confirmedAt: op.confirmedAt?.toISOString() ?? null,
        amount: milestone.amount.toString(),
        onChain: moved === null ? null : fromStroops(moved),
        matches: moved !== null && moved === toStroops(milestone.amount.toString()),
      },
    ];
  });

  const differences: string[] = [];
  if (source.escrowId) {
    const credits: Credit[] = payments.flatMap((payment) =>
      (payment.transfers ?? []).map((transfer) => ({
        from: source.escrowId as string,
        to: transfer.to,
        amount: transfer.amount,
      })),
    );
    const check = chainCheckOf(
      [
        {
          id: source.id,
          escrowId: source.escrowId,
          jobTitle: source.job.title,
          status: source.status,
          amount: source.amount.toString(),
          funded: source.fundedAt !== null,
          milestones: source.milestones.map((m) => ({
            position: m.position,
            amount: m.amount.toString(),
            status: m.status,
          })),
          pocketFee: sum(
            paid.flatMap((op) =>
              op.payouts.filter((p) => p.recipient === 'pocket').map((p) => p.amount),
            ),
          ).toString(),
        },
      ],
      [{ escrowId: source.escrowId, escrow, balance: onChain?.balance ?? 0n }],
      platforms,
      credits,
      now,
    );
    differences.push(...check.differences.map((difference) => difference.what));
  } else if (source.fundedAt) {
    differences.push('El contrato figura como depositado y no tiene escrow');
  }
  for (const row of paymentRows) {
    if (row.onChain === null) {
      differences.push(
        `Pago del hito ${row.milestonePosition + 1}: no se pudo leer su transacción`,
      );
    } else if (!row.matches) {
      differences.push(
        `Pago del hito ${row.milestonePosition + 1}: la transacción movió ${row.onChain} USDC y el hito tenía ${row.amount}`,
      );
    }
  }

  const chainMilestones = escrow?.milestones ?? [];
  return {
    checkedAt: now.toISOString(),
    contractId: source.id,
    jobTitle: source.job.title,
    status: source.status,
    startup: {
      id: source.startup.id,
      name: source.startup.startupProfile?.companyName ?? null,
      address: source.startup.stellarAddress,
    },
    specialist: {
      id: source.specialist.id,
      name: source.specialist.specialistProfile?.displayName ?? null,
      address: source.specialist.stellarAddress,
    },
    escrow: source.escrowId
      ? {
          id: source.escrowId,
          found: escrow !== null,
          ours: escrow !== null && platforms.has(escrow.roles.platform ?? ''),
          balance: fromStroops(onChain?.balance ?? 0n),
          approver: escrow?.roles.approver ?? null,
          serviceProvider: escrow?.roles.service_provider ?? null,
        }
      : null,
    money: moneyOf(source),
    milestones: source.milestones.map((milestone) => {
      const chain = chainMilestones[milestone.position];
      const label = `Hito ${milestone.position + 1}`;
      return {
        position: milestone.position,
        title: milestone.title,
        amount: milestone.amount.toString(),
        status: milestone.status,
        dueDate: milestone.dueDate.toISOString(),
        firstDeliveredAt: milestone.deliverables[0]?.createdAt.toISOString() ?? null,
        chain: chain
          ? {
              amount: fromStroops(chain.amount),
              approved: chain.flags.approved,
              released: chain.flags.released,
              disputed: chain.flags.disputed,
              resolved: chain.flags.resolved,
            }
          : null,
        matches:
          escrow === null
            ? !source.escrowId
            : !differences.some((d) => d.startsWith(`${label}:`)),
      };
    }),
    payments: paymentRows,
    operations: source.chainOperations.map((op) => ({
      id: op.id,
      kind: op.kind,
      status: op.status,
      txHash: op.txHash,
      milestonePosition: op.milestoneId ? (positionOf.get(op.milestoneId) ?? null) : null,
      signer:
        op.signerId === source.startup.id
          ? 'startup'
          : op.signerId === source.specialist.id
            ? 'specialist'
            : 'pocket',
      createdAt: op.createdAt.toISOString(),
      confirmedAt: op.confirmedAt?.toISOString() ?? null,
      error: op.error,
    })),
    differences,
  };
}

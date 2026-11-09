import type { ChainCheck, ChainTotals, PublicStats } from '@pocket/shared';
import type { ChainEscrow } from '../stellar/soroban-reader.service';

/** USDC has 7 decimals on Stellar: amounts here are in its smallest unit. */
const DECIMALS = 7;
const UNIT = 10n ** BigInt(DECIMALS);

/** A decimal string as units of 10^-7 USDC, without going through a float. */
export function toStroops(amount: string): bigint {
  const negative = amount.startsWith('-');
  const [whole = '0', fraction = ''] = amount.replace('-', '').split('.');
  const units =
    BigInt(whole) * UNIT + BigInt(fraction.padEnd(DECIMALS, '0').slice(0, DECIMALS));
  return negative ? -units : units;
}

/** Units of 10^-7 USDC as a decimal string with no trailing zeros. */
export function fromStroops(units: bigint): string {
  const negative = units < 0n;
  const size = negative ? -units : units;
  const fraction = (size % UNIT).toString().padStart(DECIMALS, '0').replace(/0+$/, '');
  const text = `${size / UNIT}${fraction ? `.${fraction}` : ''}`;
  return negative ? `-${text}` : text;
}

/** One of Pocket's escrows as the chain has it. Null when the contract is not there. */
export interface EscrowOnChain {
  escrowId: string;
  escrow: ChainEscrow | null;
  /** USDC it holds now. */
  balance: bigint;
}

/** USDC that reached an address from somewhere, as Horizon recorded it. */
export interface Credit {
  from: string;
  to: string;
  amount: string;
}

/** What left an escrow: every milestone paid or resolved takes its whole amount out. */
function leftOf(escrow: ChainEscrow): bigint {
  return escrow.milestones
    .filter((milestone) => milestone.flags.released || milestone.flags.resolved)
    .reduce((total, milestone) => total + milestone.amount, 0n);
}

/** Pocket's fee from one escrow: what its platform address received from it. */
function feeFrom(escrowId: string, escrow: ChainEscrow, credits: Credit[]): bigint {
  return credits
    .filter((credit) => credit.from === escrowId && credit.to === escrow.roles.platform)
    .reduce((total, credit) => total + toStroops(credit.amount), 0n);
}

/**
 * Pocket's traction from the chain alone: the escrows that name one of
 * Pocket's addresses as their platform, what they hold and what left them,
 * and the fee Pocket's account received from each.
 */
export function tractionOf(
  escrows: EscrowOnChain[],
  platforms: Set<string>,
  credits: Credit[],
  meta: { network: PublicStats['network']; platformAddress: string; now: Date },
): PublicStats {
  const ours = escrows.flatMap(({ escrowId, escrow, balance }) =>
    escrow && platforms.has(escrow.roles.platform ?? '')
      ? [{ escrowId, escrow, balance, left: leftOf(escrow) }]
      : [],
  );
  const funded = ours.filter(({ balance, left }) => balance + left > 0n);
  const startups = new Set(funded.map(({ escrow }) => escrow.roles.approver));
  const specialists = new Set(funded.map(({ escrow }) => escrow.roles.service_provider));
  const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n);

  return {
    network: meta.network,
    platformAddress: meta.platformAddress,
    escrows: ours.length,
    funded: fromStroops(sum(ours.map(({ balance, left }) => balance + left))),
    released: fromStroops(sum(ours.map(({ left }) => left))),
    inEscrows: fromStroops(sum(ours.map(({ balance }) => balance))),
    feesCollected: fromStroops(
      sum(ours.map(({ escrowId, escrow }) => feeFrom(escrowId, escrow, credits))),
    ),
    wallets: { startups: startups.size, specialists: specialists.size },
    repeatHires: funded.length - startups.size,
    milestonesReleased: ours.reduce(
      (total, { escrow }) =>
        total +
        escrow.milestones.filter(
          (milestone) => milestone.flags.released || milestone.flags.resolved,
        ).length,
      0,
    ),
    updatedAt: meta.now.toISOString(),
  };
}

/** A contract as the database has it, for the check against the chain. */
export interface ContractOnRecord {
  id: string;
  escrowId: string;
  jobTitle: string;
  status: string;
  amount: string;
  funded: boolean;
  milestones: { position: number; amount: string; status: string }[];
  /** Pocket's fee as read from each payment's transaction. */
  pocketFee: string;
}

const MILESTONE_ON_CHAIN: Record<
  string,
  (flags: ChainEscrow['milestones'][number]['flags']) => boolean
> = {
  paid: (flags) => flags.released,
  resolved: (flags) => flags.resolved,
  disputed: (flags) => flags.disputed && !flags.resolved,
};

/**
 * Every contract of the database against its escrow on chain: that the escrow
 * exists and is Pocket's, that it got the deposit the contract says, and that
 * each milestone's amount and state match. Also the totals each side adds up to.
 */
export function chainCheckOf(
  contracts: ContractOnRecord[],
  escrows: EscrowOnChain[],
  platforms: Set<string>,
  credits: Credit[],
  now: Date,
): ChainCheck {
  const byId = new Map(escrows.map((each) => [each.escrowId, each]));
  const differences: ChainCheck['differences'] = [];
  const chain = { funded: 0n, released: 0n, inEscrows: 0n, pocketFee: 0n };
  const database = { funded: 0n, released: 0n, inEscrows: 0n, pocketFee: 0n };

  for (const contract of contracts) {
    const note = (what: string) =>
      differences.push({
        contractId: contract.id,
        escrowId: contract.escrowId,
        jobTitle: contract.jobTitle,
        what,
      });
    const released = contract.milestones
      .filter(
        (milestone) => milestone.status === 'paid' || milestone.status === 'resolved',
      )
      .reduce((total, milestone) => total + toStroops(milestone.amount), 0n);
    const deposited = contract.funded ? toStroops(contract.amount) : 0n;
    database.funded += deposited;
    database.released += released;
    database.inEscrows += deposited > released ? deposited - released : 0n;
    database.pocketFee += toStroops(contract.pocketFee);

    const found = byId.get(contract.escrowId);
    if (!found?.escrow) {
      note('El escrow no está en la red');
      continue;
    }
    const { escrow, balance } = found;
    if (!platforms.has(escrow.roles.platform ?? '')) {
      note('El escrow no nombra a Pocket como plataforma');
      continue;
    }
    const left = leftOf(escrow);
    const fee = feeFrom(contract.escrowId, escrow, credits);
    chain.funded += balance + left;
    chain.released += left;
    chain.inEscrows += balance;
    chain.pocketFee += fee;

    if (contract.funded && balance + left !== deposited) {
      note(
        `Recibió ${fromStroops(balance + left)} USDC y el contrato dice ${fromStroops(deposited)}`,
      );
    }
    if (!contract.funded && balance + left > 0n) {
      note(
        `Tiene ${fromStroops(balance + left)} USDC y el contrato no figura como depositado`,
      );
    }
    if (escrow.milestones.length !== contract.milestones.length) {
      note(
        `Tiene ${escrow.milestones.length} hitos y el contrato ${contract.milestones.length}`,
      );
    }
    for (const milestone of contract.milestones) {
      const onChain = escrow.milestones[milestone.position];
      if (!onChain) continue;
      const label = `Hito ${milestone.position + 1}`;
      if (onChain.amount !== toStroops(milestone.amount)) {
        note(
          `${label}: ${fromStroops(onChain.amount)} USDC en la red y ${milestone.amount} en el contrato`,
        );
      }
      const expected = MILESTONE_ON_CHAIN[milestone.status];
      const moved = onChain.flags.released || onChain.flags.resolved;
      if (expected ? !expected(onChain.flags) : moved) {
        note(
          `${label}: ${STATUS_TEXT[milestone.status] ?? milestone.status} en Pocket, ${flagsText(onChain.flags)} en la red`,
        );
      }
    }
    if (fee !== toStroops(contract.pocketFee)) {
      note(
        `Comisión de Pocket: ${fromStroops(fee)} USDC en la red y ${contract.pocketFee} leídos de los pagos`,
      );
    }
  }

  const text = (totals: typeof chain): ChainTotals => ({
    funded: fromStroops(totals.funded),
    released: fromStroops(totals.released),
    inEscrows: fromStroops(totals.inEscrows),
    pocketFee: fromStroops(totals.pocketFee),
  });
  return {
    checkedAt: now.toISOString(),
    escrows: contracts.length,
    totals: { database: text(database), chain: text(chain) },
    differences,
  };
}

/** A milestone's state in Pocket, in the words the admin reads. */
const STATUS_TEXT: Record<string, string> = {
  pending: 'por entregar',
  delivered: 'entregado',
  changes_requested: 'con cambios pedidos',
  approved: 'aprobado',
  paid: 'pagado',
  disputed: 'en disputa',
  resolved: 'resuelto',
};

function flagsText(flags: ChainEscrow['milestones'][number]['flags']): string {
  if (flags.resolved) return 'resuelto';
  if (flags.released) return 'pagado';
  if (flags.disputed) return 'en disputa';
  if (flags.approved) return 'aprobado';
  return 'sin mover';
}

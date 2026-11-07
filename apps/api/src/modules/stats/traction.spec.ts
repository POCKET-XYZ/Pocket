import type { ChainEscrow } from '../stellar/soroban-reader.service';
import {
  chainCheckOf,
  fromStroops,
  toStroops,
  tractionOf,
  type ContractOnRecord,
  type EscrowOnChain,
} from './traction';

const POCKET = 'GPOCKET';
const PLATFORMS = new Set([POCKET]);
const NOW = new Date('2026-11-25T15:00:00Z');
const META = { network: 'mainnet' as const, platformAddress: POCKET, now: NOW };
const U = (amount: string) => toStroops(amount);

function flags(state: 'none' | 'released' | 'resolved' | 'disputed' = 'none') {
  return {
    approved: state === 'released',
    released: state === 'released',
    disputed: state === 'disputed' || state === 'resolved',
    resolved: state === 'resolved',
  };
}

function escrow(
  startup: string,
  specialist: string,
  milestones: [string, ReturnType<typeof flags>][],
  platform = POCKET,
): ChainEscrow {
  return {
    engagementId: 'e',
    roles: {
      approver: startup,
      service_provider: specialist,
      platform,
      release_signer: platform,
      dispute_resolver: platform,
    },
    trustline: 'CUSDC',
    platformFee: 100n,
    milestones: milestones.map(([amount, state]) => ({
      amount: U(amount),
      receiver: specialist,
      flags: state,
    })),
  };
}

// Andes hired Lucía twice and Mar once; a third escrow was never funded.
const ESCROWS: EscrowOnChain[] = [
  {
    escrowId: 'C1',
    escrow: escrow('GANDES', 'GLUCIA', [
      ['2', flags('released')],
      ['1', flags('resolved')],
    ]),
    balance: 0n,
  },
  {
    escrowId: 'C2',
    escrow: escrow('GANDES', 'GLUCIA', [
      ['3', flags('released')],
      ['4', flags()],
    ]),
    balance: U('4'),
  },
  { escrowId: 'C3', escrow: escrow('GSOL', 'GMAR', [['5', flags()]]), balance: U('5') },
  { escrowId: 'C4', escrow: escrow('GNUBE', 'GMAR', [['1', flags()]]), balance: 0n },
  // Somebody else's escrow, and an id with no contract behind it.
  {
    escrowId: 'C5',
    escrow: escrow('GX', 'GY', [['9', flags()]], 'GOTHER'),
    balance: U('9'),
  },
  { escrowId: 'C6', escrow: null, balance: 0n },
];

const CREDITS = [
  { from: 'C1', to: POCKET, amount: '0.02' },
  { from: 'C1', to: POCKET, amount: '0.005' },
  { from: 'C2', to: POCKET, amount: '0.03' },
  // A transfer from a wallet, not an escrow: not a fee.
  { from: 'GANDES', to: POCKET, amount: '10' },
];

describe('units', () => {
  it('reads and writes decimals without floats', () => {
    expect(toStroops('1.9740001')).toBe(19_740_001n);
    expect(toStroops('3')).toBe(30_000_000n);
    expect(fromStroops(19_740_001n)).toBe('1.9740001');
    expect(fromStroops(30_000_000n)).toBe('3');
    expect(fromStroops(-5_000_000n)).toBe('-0.5');
  });
});

describe('tractionOf', () => {
  const stats = tractionOf(ESCROWS, PLATFORMS, CREDITS, META);

  it('counts only escrows on chain that name Pocket as their platform', () => {
    expect(stats.escrows).toBe(4);
  });

  it('adds what came in, what left and what is still held', () => {
    // C1: 3 left. C2: 3 left and 4 held. C3: 5 held.
    expect(stats.funded).toBe('15');
    expect(stats.released).toBe('6');
    expect(stats.inEscrows).toBe('9');
    expect(stats.milestonesReleased).toBe(3);
  });

  it("takes Pocket's fee from what the escrows paid the platform account", () => {
    expect(stats.feesCollected).toBe('0.055');
  });

  it('counts wallets and repeat hires among funded escrows only', () => {
    expect(stats.wallets).toEqual({ startups: 2, specialists: 2 });
    expect(stats.repeatHires).toBe(1);
  });

  it('says where the numbers can be checked, and from when they are', () => {
    expect(stats).toMatchObject({
      network: 'mainnet',
      platformAddress: POCKET,
      updatedAt: NOW.toISOString(),
    });
  });
});

function record(overrides: Partial<ContractOnRecord>): ContractOnRecord {
  return {
    id: 'k1',
    escrowId: 'C1',
    jobTitle: 'Leads',
    status: 'completed',
    amount: '3',
    funded: true,
    milestones: [
      { position: 0, amount: '2', status: 'paid' },
      { position: 1, amount: '1', status: 'resolved' },
    ],
    pocketFee: '0.025',
    ...overrides,
  };
}

describe('chainCheckOf', () => {
  it('finds nothing when the database and the chain agree', () => {
    const check = chainCheckOf([record({})], ESCROWS, PLATFORMS, CREDITS, NOW);
    expect(check.differences).toEqual([]);
    expect(check.totals.database).toEqual(check.totals.chain);
    expect(check.totals.chain).toEqual({
      funded: '3',
      released: '3',
      inEscrows: '0',
      pocketFee: '0.025',
    });
  });

  it('names each difference in words', () => {
    const check = chainCheckOf(
      [
        record({
          id: 'k2',
          escrowId: 'C2',
          amount: '8',
          status: 'active',
          milestones: [
            { position: 0, amount: '3', status: 'approved' },
            { position: 1, amount: '4', status: 'paid' },
          ],
          pocketFee: '0.03',
        }),
        record({ id: 'k5', escrowId: 'C5' }),
        record({ id: 'k6', escrowId: 'C6' }),
        record({
          id: 'k4',
          escrowId: 'C3',
          funded: false,
          amount: '5',
          milestones: [{ position: 0, amount: '5', status: 'pending' }],
          pocketFee: '0',
        }),
      ],
      ESCROWS,
      PLATFORMS,
      CREDITS,
      NOW,
    );
    expect(check.differences.map((d) => `${d.contractId}: ${d.what}`)).toEqual([
      'k2: Recibió 7 USDC y el contrato dice 8',
      'k2: Hito 1: aprobado en Pocket, pagado en la red',
      'k2: Hito 2: pagado en Pocket, sin mover en la red',
      'k5: El escrow no nombra a Pocket como plataforma',
      'k6: El escrow no está en la red',
      'k4: Tiene 5 USDC y el contrato no figura como depositado',
    ]);
  });

  it('notes a milestone amount or a fee that does not match', () => {
    const check = chainCheckOf(
      [
        record({
          milestones: [
            { position: 0, amount: '2.5', status: 'paid' },
            { position: 1, amount: '1', status: 'resolved' },
          ],
          amount: '3',
          pocketFee: '0.02',
        }),
      ],
      ESCROWS,
      PLATFORMS,
      CREDITS,
      NOW,
    );
    expect(check.differences.map((d) => d.what)).toEqual([
      'Hito 1: 2 USDC en la red y 2.5 en el contrato',
      'Comisión de Pocket: 0.025 USDC en la red y 0.02 leídos de los pagos',
    ]);
  });
});

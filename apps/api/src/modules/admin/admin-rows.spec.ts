import { Prisma } from '@prisma/client';
import type { ChainEscrow } from '../stellar/soroban-reader.service';
import {
  attentionOf,
  contractCheckOf,
  contractRow,
  type AdminContractSource,
} from './admin-rows';

const D = (value: number | string) => new Prisma.Decimal(value);
const NOW = new Date('2026-11-25T15:00:00Z');
const POCKET = 'GPOCKET';
const ESCROW = 'CESCROW';

function milestone(overrides: Record<string, unknown>) {
  return {
    id: 'm1',
    position: 0,
    title: 'Primero',
    amount: D(2),
    status: 'pending',
    dueDate: new Date('2026-12-10'),
    approvedAt: null,
    paidAt: null,
    deliverables: [],
    disputes: [],
    ...overrides,
  };
}

function op(overrides: Record<string, unknown>) {
  return {
    id: `op-${String(overrides.txHash)}`,
    kind: 'release',
    status: 'confirmed',
    txHash: 'tx',
    milestoneId: 'm1',
    signerId: null,
    error: null,
    createdAt: new Date('2026-11-20T10:00:00Z'),
    confirmedAt: new Date('2026-11-20T10:00:05Z'),
    payoutsReadAt: new Date('2026-11-20T10:01:00Z'),
    payouts: [
      { recipient: 'specialist', amount: D('1.974') },
      { recipient: 'pocket', amount: D('0.02') },
      { recipient: 'trustless_work', amount: D('0.006') },
    ],
    ...overrides,
  };
}

function contract(overrides: Record<string, unknown> = {}): AdminContractSource {
  return {
    id: 'c1',
    amount: D(3),
    status: 'active',
    escrowId: ESCROW,
    acceptedAt: new Date('2026-11-01'),
    fundedAt: new Date('2026-11-02'),
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-11-01'),
    job: { title: 'Leads', category: 'growth' },
    startup: {
      id: 's1',
      stellarAddress: 'GANDES',
      startupProfile: { companyName: 'Andes' },
    },
    specialist: {
      id: 'e1',
      stellarAddress: 'GLUCIA',
      specialistProfile: { displayName: 'Lucía' },
    },
    milestones: [],
    chainOperations: [],
    ...overrides,
  } as unknown as AdminContractSource;
}

describe('contractRow', () => {
  it('adds up the money and the milestones', () => {
    const row = contractRow(
      contract({
        milestones: [
          milestone({ id: 'm1', status: 'paid', paidAt: new Date('2026-11-20') }),
          milestone({
            id: 'm2',
            position: 1,
            amount: D(1),
            dueDate: new Date('2026-12-01'),
          }),
        ],
        chainOperations: [op({ txHash: 'tx1' })],
      }),
      NOW,
    );
    expect(row).toMatchObject({
      amount: '3',
      deposited: '3',
      released: '2',
      inEscrow: '1',
      milestones: { total: 2, done: 1, delivered: 0, overdue: 0, disputed: 0 },
      nextDue: '2026-12-01T00:00:00.000Z',
      startup: { name: 'Andes' },
      specialist: { name: 'Lucía' },
      flags: [],
    });
    expect(row.lastActivityAt).toBe('2026-11-20T10:00:05.000Z');
  });

  it('flags what needs a look', () => {
    const row = contractRow(
      contract({
        milestones: [
          milestone({ id: 'm1', status: 'pending', dueDate: new Date('2026-11-20') }),
          milestone({ id: 'm2', position: 1, status: 'delivered' }),
          milestone({
            id: 'm3',
            position: 2,
            status: 'disputed',
            disputes: [{ status: 'open', createdAt: new Date('2026-11-24') }],
          }),
        ],
        chainOperations: [
          op({ txHash: 'tx1', milestoneId: 'm2', payoutsReadAt: null }),
          op({ txHash: 'tx2', kind: 'approve', status: 'failed', milestoneId: 'm2' }),
        ],
      }),
      NOW,
    );
    expect(row.flags).toEqual([
      'dispute',
      'overdue',
      'to_review',
      'unread_payment',
      'failed_step',
    ]);
    expect(row.milestones).toMatchObject({ overdue: 1, delivered: 1, disputed: 1 });
  });

  it('does not flag a failed step that was done afterwards', () => {
    const row = contractRow(
      contract({
        milestones: [milestone({ id: 'm1', status: 'paid' })],
        chainOperations: [
          op({ txHash: 'tx1', status: 'failed' }),
          op({ txHash: 'tx2', createdAt: new Date('2026-11-21') }),
        ],
      }),
      NOW,
    );
    expect(row.flags).toEqual([]);
  });

  it('flags a contract waiting for its deposit, with nothing in escrow', () => {
    const row = contractRow(
      contract({ status: 'awaiting_funding', fundedAt: null }),
      NOW,
    );
    expect(row.flags).toEqual(['awaiting_funding']);
    expect(row.deposited).toBe('0');
  });
});

describe('attentionOf', () => {
  it('lists each thing to look at in words, the most urgent first', () => {
    const items = attentionOf(
      [
        contract({
          milestones: [
            milestone({ id: 'm1', status: 'pending', dueDate: new Date('2026-11-20') }),
            milestone({
              id: 'm2',
              position: 1,
              status: 'delivered',
              deliverables: [{ createdAt: new Date('2026-11-22') }],
            }),
          ],
        }),
        contract({
          id: 'c2',
          status: 'awaiting_funding',
          acceptedAt: new Date('2026-11-18'),
        }),
      ],
      NOW,
    );
    expect(
      items.map((item) => `${item.contractId} ${item.flag}: ${item.detail}`),
    ).toEqual([
      'c1 overdue: El hito 1 venció el 20 nov sin entrega',
      'c2 awaiting_funding: El experto aceptó y falta el depósito de la startup',
      'c1 to_review: El hito 2 está entregado y espera a la startup',
    ]);
  });
});

function escrow(
  milestones: [string, Partial<ChainEscrow['milestones'][number]['flags']>][],
) {
  return {
    engagementId: 'c1',
    roles: {
      approver: 'GANDES',
      service_provider: 'GLUCIA',
      platform: POCKET,
      release_signer: POCKET,
      dispute_resolver: POCKET,
    },
    trustline: 'CUSDC',
    platformFee: 100n,
    milestones: milestones.map(([amount, flags]) => ({
      amount: BigInt(Math.round(Number(amount) * 1e7)),
      receiver: 'GLUCIA',
      flags: {
        approved: false,
        released: false,
        disputed: false,
        resolved: false,
        ...flags,
      },
    })),
  } as ChainEscrow;
}

describe('contractCheckOf', () => {
  const paidOne = contract({
    milestones: [
      milestone({ id: 'm1', status: 'paid' }),
      milestone({ id: 'm2', position: 1, amount: D(1) }),
    ],
    chainOperations: [
      op({ txHash: 'deploy', kind: 'deploy', milestoneId: null, payouts: [] }),
      op({
        txHash: 'fund',
        kind: 'fund',
        milestoneId: null,
        signerId: 's1',
        payouts: [],
      }),
      op({ txHash: 'tx1' }),
    ],
  });
  const PAID = [
    {
      txHash: 'tx1',
      transfers: [
        { to: 'GLUCIA', amount: '1.974' },
        { to: POCKET, amount: '0.02' },
        { to: 'GTW', amount: '0.006' },
      ],
    },
  ];

  it('finds nothing when the escrow and each payment match', () => {
    const check = contractCheckOf(
      paidOne,
      {
        escrow: escrow([
          ['2', { approved: true, released: true }],
          ['1', {}],
        ]),
        balance: 10_000_000n,
      },
      PAID,
      new Set([POCKET]),
      NOW,
    );
    expect(check.differences).toEqual([]);
    expect(check.escrow).toMatchObject({ found: true, ours: true, balance: '1' });
    expect(check.milestones.map((m) => m.matches)).toEqual([true, true]);
    expect(check.payments).toEqual([
      expect.objectContaining({
        txHash: 'tx1',
        amount: '2',
        onChain: '2',
        matches: true,
      }),
    ]);
    expect(check.operations.map((o) => `${o.kind}:${o.signer}`)).toEqual([
      'deploy:pocket',
      'fund:startup',
      'release:pocket',
    ]);
  });

  it('names a milestone the chain does not have as paid, and a payment that moved less', () => {
    const check = contractCheckOf(
      paidOne,
      {
        escrow: escrow([
          ['2', { approved: true }],
          ['1', {}],
        ]),
        balance: 30_000_000n,
      },
      [{ txHash: 'tx1', transfers: [{ to: 'GLUCIA', amount: '1.5' }] }],
      new Set([POCKET]),
      NOW,
    );
    expect(check.differences).toEqual([
      'Hito 1: pagado en Pocket, aprobado en la red',
      'Comisión de Pocket: 0 USDC en la red y 0.02 leídos de los pagos',
      'Pago del hito 1: la transacción movió 1.5 USDC y el hito tenía 2',
    ]);
    expect(check.milestones.map((m) => m.matches)).toEqual([false, true]);
  });

  it('says when the escrow is missing from the network', () => {
    const check = contractCheckOf(
      paidOne,
      { escrow: null, balance: 0n },
      PAID,
      new Set([POCKET]),
      NOW,
    );
    expect(check.escrow).toMatchObject({ found: false, ours: false });
    expect(check.differences).toEqual(['El escrow no está en la red']);
  });
});

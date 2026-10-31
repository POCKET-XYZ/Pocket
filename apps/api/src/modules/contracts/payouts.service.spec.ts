import type { PrismaService } from '../../prisma/prisma.service';
import type { SorobanReader } from '../stellar/soroban-reader.service';
import type { StellarService } from '../stellar/stellar.service';
import type { TrustlessWorkClient } from '../stellar/trustless-work.client';
import { PayoutsService } from './payouts.service';

describe('PayoutsService', () => {
  let prisma: {
    chainOperation: { findMany: jest.Mock; updateMany: jest.Mock };
    contract: { findUnique: jest.Mock };
    chainPayout: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let stellar: { platformAddress: string; usdcTransfersFrom: jest.Mock };
  let soroban: { escrow: jest.Mock };
  let service: PayoutsService;

  beforeEach(() => {
    prisma = {
      chainOperation: {
        findMany: jest.fn().mockResolvedValue([{ id: 'op-1', txHash: 'hash-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      contract: {
        findUnique: jest.fn().mockResolvedValue({
          escrowId: 'CESCROW',
          startup: { stellarAddress: 'GSTART' },
          specialist: { stellarAddress: 'GSPEC' },
        }),
      },
      chainPayout: { createMany: jest.fn() },
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma)),
    };
    stellar = {
      platformAddress: 'GPOCKET',
      usdcTransfersFrom: jest.fn().mockResolvedValue([
        { to: 'GTW', amount: '0.09' },
        { to: 'GPOCKET', amount: '0.3' },
        { to: 'GSPEC', amount: '29.61' },
      ]),
    };
    // The escrow was deployed with Pocket's current platform address.
    soroban = { escrow: jest.fn().mockResolvedValue({ roles: { platform: 'GPOCKET' } }) };
    service = new PayoutsService(
      prisma as unknown as PrismaService,
      stellar as unknown as StellarService,
      { feeAddress: undefined } as TrustlessWorkClient,
      soroban as unknown as SorobanReader,
    );
  });

  it('stores what each confirmed release paid out of the escrow, once', async () => {
    await service.readMissing('contract-1');

    expect(prisma.chainOperation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contractId: 'contract-1',
          status: 'confirmed',
          payoutsReadAt: null,
        }),
      }),
    );
    expect(stellar.usdcTransfersFrom).toHaveBeenCalledWith('hash-1', 'CESCROW');
    expect(prisma.chainOperation.updateMany).toHaveBeenCalledWith({
      where: { id: 'op-1', payoutsReadAt: null },
      data: { payoutsReadAt: expect.any(Date) },
    });
    expect(prisma.chainPayout.createMany).toHaveBeenCalledWith({
      data: [
        {
          recipient: 'trustless_work',
          address: 'GTW',
          amount: '0.09',
          operationId: 'op-1',
        },
        { recipient: 'pocket', address: 'GPOCKET', amount: '0.3', operationId: 'op-1' },
        {
          recipient: 'specialist',
          address: 'GSPEC',
          amount: '29.61',
          operationId: 'op-1',
        },
      ],
    });
  });

  it("pays Pocket's fee to the platform address the escrow was deployed with", async () => {
    stellar.platformAddress = 'GNEWKEY';
    await service.readMissing('contract-1');
    const { data } = prisma.chainPayout.createMany.mock.calls[0][0] as {
      data: { recipient: string; address: string }[];
    };
    expect(data.find((p) => p.address === 'GPOCKET')?.recipient).toBe('pocket');
  });

  it("falls back to Pocket's current address when the escrow cannot be read", async () => {
    soroban.escrow.mockRejectedValue(new Error('rpc down'));
    await service.readMissing('contract-1');
    const { data } = prisma.chainPayout.createMany.mock.calls[0][0] as {
      data: { recipient: string; address: string }[];
    };
    expect(data.find((p) => p.address === 'GPOCKET')?.recipient).toBe('pocket');
  });

  it('writes nothing when another reader stored it first', async () => {
    prisma.chainOperation.updateMany.mockResolvedValue({ count: 0 });
    await service.readMissing('contract-1');
    expect(prisma.chainPayout.createMany).not.toHaveBeenCalled();
  });

  it('leaves a transaction Horizon has not indexed yet for the next read', async () => {
    stellar.usdcTransfersFrom.mockResolvedValue([]);
    await service.readMissing('contract-1');
    expect(prisma.chainOperation.updateMany).not.toHaveBeenCalled();
  });

  it('never throws when Horizon is down', async () => {
    stellar.usdcTransfersFrom.mockRejectedValue(new Error('timeout'));
    await expect(service.readMissing('contract-1')).resolves.toBeUndefined();
    expect(prisma.chainOperation.updateMany).not.toHaveBeenCalled();
  });

  it('never throws when the database fails, since it runs in the background', async () => {
    prisma.chainOperation.findMany.mockRejectedValue(new Error('connection lost'));
    await expect(service.readMissing('contract-1')).resolves.toBeUndefined();
  });

  it('asks nothing of Stellar when every payment is read', async () => {
    prisma.chainOperation.findMany.mockResolvedValue([]);
    await service.readMissing('contract-1');
    expect(prisma.contract.findUnique).not.toHaveBeenCalled();
    expect(stellar.usdcTransfersFrom).not.toHaveBeenCalled();
  });
});

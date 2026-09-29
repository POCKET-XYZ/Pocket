import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PlatformTxPolicy } from './platform-tx-policy';
import { ChainOperationsService, stepKeyOf } from './chain-operations.service';
import type { StellarService } from './stellar.service';
import type { TrustlessWorkClient } from './trustless-work.client';


/** Any policy: what it checks is covered by the policy's own tests. */
const POLICY: PlatformTxPolicy = {
  contractId: 'CESCROW',
  fn: 'release_milestone_funds',
  maxFeeStroops: 20_000_000,
  checkArgs: () => undefined,
};

describe('ChainOperationsService', () => {
  let prisma: {
    chainOperation: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };
  let stellar: {
    networkPassphrase: string;
    hashOf: jest.Mock;
    signAsPlatform: jest.Mock;
    submitToHorizon: jest.Mock;
  };
  let trustlessWork: { send: jest.Mock };
  let service: ChainOperationsService;

  beforeEach(() => {
    prisma = {
      chainOperation: {
        create: jest.fn(async ({ data }: { data: object }) => ({ id: 'op-1', ...data })),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(async ({ data }: { data: object }) => ({ id: 'op-1', ...data })),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'op-1', status: 'confirmed' }),
      },
    };
    stellar = {
      networkPassphrase: 'Test SDF Network ; September 2015',
      hashOf: jest.fn().mockReturnValue('hash-1'),
      signAsPlatform: jest.fn().mockReturnValue('signed-by-platform'),
      submitToHorizon: jest.fn().mockResolvedValue('hash-1'),
    };
    trustlessWork = { send: jest.fn().mockResolvedValue({}) };
    service = new ChainOperationsService(
      prisma as unknown as PrismaService,
      stellar as unknown as StellarService,
      trustlessWork as unknown as TrustlessWorkClient,
    );
  });

  it('records a prepared transaction with its hash and signer', async () => {
    const prepared = await service.prepare(
      { kind: 'fund', contractId: 'contract-1' },
      'unsigned-xdr',
      'user-1',
      3,
    );

    expect(prisma.chainOperation.create).toHaveBeenCalledWith({
      data: {
        kind: 'fund',
        contractId: 'contract-1',
        txHash: 'hash-1',
        signerId: 'user-1',
        amount: 3,
      },
    });
    expect(prepared).toEqual({
      operationId: 'op-1',
      xdr: 'unsigned-xdr',
      networkPassphrase: stellar.networkPassphrase,
    });
  });

  describe('when Trustless Work builds the same transaction twice', () => {
    const duplicateHash = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );
    const alreadyPrepared = {
      id: 'op-0',
      txHash: 'hash-1',
      status: 'prepared',
      signerId: 'user-1',
      kind: 'fund',
      contractId: 'contract-1',
      milestoneId: null,
    };

    beforeEach(() => {
      prisma.chainOperation.create.mockRejectedValue(duplicateHash);
    });

    it('hands back the one already prepared for this user and step', async () => {
      prisma.chainOperation.findUnique.mockResolvedValue(alreadyPrepared);
      const prepared = await service.prepare(
        { kind: 'fund', contractId: 'contract-1' },
        'unsigned-xdr',
        'user-1',
      );
      expect(prepared.operationId).toBe('op-0');
    });

    it('refuses to reuse it for someone else', async () => {
      prisma.chainOperation.findUnique.mockResolvedValue({
        ...alreadyPrepared,
        signerId: 'user-2',
      });
      await expect(
        service.prepare(
          { kind: 'fund', contractId: 'contract-1' },
          'unsigned-xdr',
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('only accepts a signed transaction prepared for this user, purpose and contract', async () => {
    await service.submitSigned(
      { kind: 'approve', contractId: 'contract-1', milestoneId: 'milestone-1' },
      'signed-xdr',
      'user-1',
    );

    expect(prisma.chainOperation.updateMany).toHaveBeenCalledWith({
      where: {
        txHash: 'hash-1',
        signerId: 'user-1',
        status: 'prepared',
        kind: 'approve',
        contractId: 'contract-1',
        milestoneId: 'milestone-1',
      },
      data: expect.objectContaining({ status: 'confirmed' }),
    });
    expect(trustlessWork.send).toHaveBeenCalledWith('signed-xdr');
  });

  it('refuses a transaction it did not prepare, or one already submitted', async () => {
    prisma.chainOperation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.submitSigned(
        { kind: 'fund', contractId: 'contract-1' },
        'signed-xdr',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(trustlessWork.send).not.toHaveBeenCalled();
  });

  it('refuses something that is not a transaction', async () => {
    stellar.hashOf.mockImplementation(() => {
      throw new Error('bad xdr');
    });
    await expect(
      service.submitSigned(
        { kind: 'fund', contractId: 'contract-1' },
        'garbage',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.chainOperation.updateMany).not.toHaveBeenCalled();
  });

  it('sends trustlines straight to Horizon', async () => {
    await service.submitSigned({ kind: 'trustline' }, 'signed-xdr', 'user-1');
    expect(stellar.submitToHorizon).toHaveBeenCalledWith('signed-xdr');
    expect(trustlessWork.send).not.toHaveBeenCalled();
  });

  it('marks the operation failed when the network refuses it', async () => {
    trustlessWork.send.mockRejectedValue(new ServiceUnavailableException('boom'));
    await expect(
      service.submitSigned(
        { kind: 'fund', contractId: 'contract-1' },
        'signed-xdr',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.chainOperation.update).toHaveBeenCalledWith({
      where: { txHash: 'hash-1' },
      data: expect.objectContaining({ status: 'failed', error: 'boom' }),
    });
  });

  it('signs platform operations and returns the deployed contract id', async () => {
    trustlessWork.send.mockResolvedValue({ contractId: 'CESCROW' });

    const result = await service.executeAsPlatform(
      { kind: 'deploy', contractId: 'contract-1' },
      'unsigned-xdr',
      POLICY,
    );

    // The policy travels with the transaction to the only place that signs.
    expect(stellar.signAsPlatform).toHaveBeenCalledWith('unsigned-xdr', POLICY);
    expect(trustlessWork.send).toHaveBeenCalledWith('signed-by-platform');
    expect(result.contractId).toBe('CESCROW');
  });

  describe('each escrow step happens once', () => {
    const duplicate = () =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });

    it('claims a user step with its key before sending it', async () => {
      await service.submitSigned(
        { kind: 'fund', contractId: 'contract-1' },
        'signed-xdr',
        'user-1',
      );
      expect(prisma.chainOperation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stepKey: 'fund:contract-1' }),
        }),
      );
    });

    it('refuses a second funding of the same contract without sending it', async () => {
      prisma.chainOperation.updateMany.mockRejectedValue(duplicate());
      await expect(
        service.submitSigned(
          { kind: 'fund', contractId: 'contract-1' },
          'other-signed-xdr',
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(trustlessWork.send).not.toHaveBeenCalled();
    });

    it('claims a platform step as confirmed before sending it', async () => {
      await service.executeAsPlatform(
        { kind: 'release', contractId: 'contract-1', milestoneId: 'milestone-1' },
        'unsigned-xdr',
        POLICY,
      );
      expect(prisma.chainOperation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'confirmed',
          stepKey: 'release:milestone-1',
        }),
      });
      const claimedAt = prisma.chainOperation.create.mock.invocationCallOrder[0];
      const sentAt = trustlessWork.send.mock.invocationCallOrder[0];
      expect(claimedAt).toBeLessThan(sentAt);
    });

    it('refuses a second release of the same milestone without sending it', async () => {
      prisma.chainOperation.create.mockRejectedValue(duplicate());
      await expect(
        service.executeAsPlatform(
          { kind: 'release', contractId: 'contract-1', milestoneId: 'milestone-1' },
          'unsigned-xdr',
          POLICY,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(trustlessWork.send).not.toHaveBeenCalled();
    });

    it('frees the step when the network refuses it, so it can be retried', async () => {
      trustlessWork.send.mockRejectedValue(new ServiceUnavailableException('boom'));
      await expect(
        service.executeAsPlatform(
          { kind: 'resolve', contractId: 'contract-1', milestoneId: 'milestone-1' },
          'unsigned-xdr',
          POLICY,
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.chainOperation.update).toHaveBeenCalledWith({
        where: { txHash: 'hash-1' },
        data: expect.objectContaining({ status: 'failed', stepKey: null }),
      });
    });

    it('keys deploy and fund by contract, the rest by milestone, trustlines by nothing', () => {
      expect(stepKeyOf({ kind: 'deploy', contractId: 'c-1' })).toBe('deploy:c-1');
      expect(stepKeyOf({ kind: 'fund', contractId: 'c-1', milestoneId: 'm-1' })).toBe(
        'fund:c-1',
      );
      expect(stepKeyOf({ kind: 'approve', contractId: 'c-1', milestoneId: 'm-1' })).toBe(
        'approve:m-1',
      );
      expect(stepKeyOf({ kind: 'dispute', contractId: 'c-1', milestoneId: 'm-1' })).toBe(
        'dispute:m-1',
      );
      expect(stepKeyOf({ kind: 'trustline' })).toBeNull();
      expect(() => stepKeyOf({ kind: 'approve', contractId: 'c-1' })).toThrow();
    });
  });
});

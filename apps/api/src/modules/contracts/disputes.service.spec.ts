import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotYetConfirmed } from '../stellar/chain-operations.service';
import { DisputesService, splitFor } from './disputes.service';
import type { EscrowService } from './escrow.service';
import type { MilestonesService } from './milestones.service';

const startup: AuthUser = {
  sub: 'startup-1',
  role: 'startup',
  stellarAddress: 'GSTARTUP',
};
const specialist: AuthUser = {
  sub: 'specialist-1',
  role: 'specialist',
  stellarAddress: 'GSPECIALIST',
};
const outsider: AuthUser = {
  sub: 'other-1',
  role: 'specialist',
  stellarAddress: 'GOTHER',
};
const manager: AuthUser = {
  sub: 'manager-1',
  role: 'manager',
  stellarAddress: 'GMANAGER',
};

const contract = {
  id: 'contract-1',
  startupId: 'startup-1',
  specialistId: 'specialist-1',
  status: 'active',
  escrowId: 'CESCROW',
};

describe('splitFor', () => {
  const total = new Prisma.Decimal(100);

  it('pays everything to the specialist', () => {
    const split = splitFor({ outcome: 'pay_specialist' }, total);
    expect(split.specialistAmount.toString()).toBe('100');
    expect(split.startupAmount.toString()).toBe('0');
  });

  it('refunds everything to the startup', () => {
    const split = splitFor({ outcome: 'refund_startup' }, total);
    expect(split.specialistAmount.toString()).toBe('0');
    expect(split.startupAmount.toString()).toBe('100');
  });

  it('splits exactly, without floating point drift', () => {
    const split = splitFor(
      { outcome: 'split', specialistAmount: 33.3333333 },
      new Prisma.Decimal('100.0000001'),
    );
    expect(split.startupAmount.toString()).toBe('66.6666668');
  });

  it.each([0, 100, 150])('refuses a split that gives %s to the specialist', (amount) => {
    expect(() => splitFor({ outcome: 'split', specialistAmount: amount }, total)).toThrow(
      BadRequestException,
    );
  });
});

describe('DisputesService', () => {
  let prisma: {
    dispute: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    disputeEvidence: { create: jest.Mock };
    chainOperation: { findUnique: jest.Mock };
    milestone: { update: jest.Mock };
    contract: { findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };
  let escrow: {
    prepareDispute: jest.Mock;
    submitDispute: jest.Mock;
    milestoneHas: jest.Mock;
    milestoneFlags: jest.Mock;
    discard: jest.Mock;
    resolve: jest.Mock;
  };
  let milestones: { load: jest.Mock; completeIfDone: jest.Mock };
  let service: DisputesService;

  beforeEach(() => {
    prisma = {
      dispute: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      disputeEvidence: { create: jest.fn() },
      chainOperation: { findUnique: jest.fn() },
      milestone: { update: jest.fn() },
      contract: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          startup: { stellarAddress: 'GSTARTUP' },
          specialist: { stellarAddress: 'GSPECIALIST' },
        }),
      },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    };
    escrow = {
      prepareDispute: jest.fn(),
      submitDispute: jest.fn().mockResolvedValue({ txHash: 'hash-1' }),
      milestoneHas: jest.fn(),
      // Not disputed on chain yet, unless a test says so.
      milestoneFlags: jest.fn().mockResolvedValue({}),
      discard: jest.fn(),
      resolve: jest.fn(),
    };
    milestones = { load: jest.fn(), completeIfDone: jest.fn() };
    service = new DisputesService(
      prisma as unknown as PrismaService,
      escrow as unknown as EscrowService,
      milestones as unknown as MilestonesService,
    );
  });

  describe('prepareOpen', () => {
    it.each(['pending', 'delivered', 'changes_requested'])(
      'lets a party dispute a %s milestone',
      async (status) => {
        milestones.load.mockResolvedValue({ id: 'milestone-1', status, contract });
        await service.prepareOpen(startup, 'milestone-1');
        expect(escrow.prepareDispute).toHaveBeenCalled();
      },
    );

    it.each(['approved', 'paid', 'disputed', 'resolved'])(
      'does not dispute a %s milestone',
      async (status) => {
        milestones.load.mockResolvedValue({ id: 'milestone-1', status, contract });
        await expect(service.prepareOpen(startup, 'milestone-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      },
    );

    it('refuses someone outside the contract', async () => {
      milestones.load.mockResolvedValue({
        id: 'milestone-1',
        status: 'pending',
        contract,
      });
      await expect(service.prepareOpen(outsider, 'milestone-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('open', () => {
    beforeEach(() => {
      milestones.load.mockResolvedValue({
        id: 'milestone-1',
        contractId: 'contract-1',
        status: 'delivered',
        position: 1,
        contract,
      });
    });

    it('records the dispute once the escrow shows it', async () => {
      escrow.milestoneHas.mockResolvedValue(true);
      prisma.dispute.create.mockResolvedValue({ id: 'dispute-1' });

      const dispute = await service.open(specialist, 'milestone-1', {
        signedXdr: 'signed',
        reason: 'The report never arrived',
      });

      expect(dispute).toEqual({ id: 'dispute-1' });
      expect(prisma.milestone.update).toHaveBeenCalledWith({
        where: { id: 'milestone-1' },
        data: { status: 'disputed' },
      });
      expect(escrow.discard).not.toHaveBeenCalled();
    });

    it('frees the step when the escrow does not show the dispute', async () => {
      // Trustless Work answers as soon as the network takes the transaction, so
      // a transaction that then failed would otherwise block the milestone for
      // good: its step is claimed and the dispute never opens.
      escrow.milestoneHas.mockResolvedValue(false);

      await expect(
        service.open(specialist, 'milestone-1', {
          signedXdr: 'signed',
          reason: 'The report never arrived',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(escrow.discard).toHaveBeenCalledWith('hash-1', expect.any(String));
      expect(prisma.dispute.create).not.toHaveBeenCalled();
      expect(prisma.milestone.update).not.toHaveBeenCalled();
    });
  });

  describe('a dispute that landed on chain after the request gave up', () => {
    const milestone = {
      id: 'milestone-1',
      contractId: 'contract-1',
      position: 0,
      status: 'delivered',
      contract,
    };

    it('is recorded, with who signed it, instead of being sent again', async () => {
      milestones.load.mockResolvedValue(milestone);
      escrow.milestoneFlags.mockResolvedValue({ disputed: true });
      prisma.dispute.create.mockResolvedValue({ id: 'dispute-1' });
      prisma.chainOperation.findUnique.mockResolvedValue({ signerId: 'specialist-1' });
      await service.open(startup, 'milestone-1', {
        signedXdr: 'signed',
        reason: 'The work never arrived at all',
      });
      expect(escrow.submitDispute).not.toHaveBeenCalled();
      expect(prisma.dispute.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ milestoneId: 'milestone-1', openedById: 'specialist-1' }),
      });
    });

    it('is not prepared a second time', async () => {
      milestones.load.mockResolvedValue(milestone);
      escrow.milestoneFlags.mockResolvedValue({ disputed: true });
      prisma.dispute.create.mockResolvedValue({ id: 'dispute-1' });
      await expect(service.prepareOpen(startup, 'milestone-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(escrow.prepareDispute).not.toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    const openDispute = {
      id: 'dispute-1',
      status: 'open',
      milestone: {
        id: 'milestone-1',
        contractId: 'contract-1',
        position: 1,
        amount: new Prisma.Decimal(2),
        contract,
      },
    };

    it('executes the split on chain and closes the dispute', async () => {
      prisma.dispute.findUnique.mockResolvedValue(openDispute);
      escrow.milestoneHas.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      await service.resolve(manager, 'dispute-1', {
        outcome: 'split',
        specialistAmount: 1.5,
        note: 'Most of the work was delivered',
      });

      const shares = escrow.resolve.mock.calls[0][2] as {
        address: string;
        amount: Prisma.Decimal;
      }[];
      expect(shares.map((s) => [s.address, s.amount.toString()])).toEqual([
        ['GSPECIALIST', '1.5'],
        ['GSTARTUP', '0.5'],
      ]);
      // The decision is recorded before anything is sent.
      expect(prisma.dispute.updateMany).toHaveBeenCalledWith({
        where: { id: 'dispute-1', status: 'open', outcome: null },
        data: expect.objectContaining({ outcome: 'split', resolvedById: 'manager-1' }),
      });
      expect(prisma.dispute.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        escrow.resolve.mock.invocationCallOrder[0],
      );
      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'resolved' }),
        }),
      );
      expect(milestones.completeIfDone).toHaveBeenCalledWith('contract-1');
    });

    it('refuses a different decision while another one is being executed', async () => {
      prisma.dispute.findUnique.mockResolvedValue(openDispute);
      prisma.dispute.updateMany.mockResolvedValue({ count: 0 });
      prisma.dispute.findUniqueOrThrow.mockResolvedValue({
        status: 'open',
        outcome: 'pay_specialist',
        specialistAmount: new Prisma.Decimal(2),
        startupAmount: new Prisma.Decimal(0),
      });
      await expect(
        service.resolve(manager, 'dispute-1', { outcome: 'refund_startup', note: 'The other way' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(escrow.resolve).not.toHaveBeenCalled();
    });

    it('takes the decision back when nothing was sent', async () => {
      prisma.dispute.findUnique.mockResolvedValue(openDispute);
      escrow.milestoneHas.mockResolvedValue(false);
      escrow.resolve.mockRejectedValue(new Error('Trustless Work is down'));
      await expect(
        service.resolve(manager, 'dispute-1', { outcome: 'refund_startup', note: 'Nothing done' }),
      ).rejects.toThrow('down');
      expect(prisma.dispute.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'dispute-1', status: 'open' },
        data: expect.objectContaining({ outcome: null }),
      });
    });

    it('keeps the decision while its transaction may still land', async () => {
      prisma.dispute.findUnique.mockResolvedValue(openDispute);
      escrow.milestoneHas.mockResolvedValue(false);
      escrow.resolve.mockRejectedValue(new NotYetConfirmed());
      await expect(
        service.resolve(manager, 'dispute-1', { outcome: 'refund_startup', note: 'Nothing done' }),
      ).rejects.toBeInstanceOf(NotYetConfirmed);
      expect(prisma.dispute.updateMany).toHaveBeenCalledTimes(1);
    });

    it('does not resolve the same dispute twice', async () => {
      prisma.dispute.findUnique.mockResolvedValue({ ...openDispute, status: 'resolved' });
      await expect(
        service.resolve(manager, 'dispute-1', {
          outcome: 'refund_startup',
          note: 'Nothing was delivered',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(escrow.resolve).not.toHaveBeenCalled();
    });
  });

  it('keeps evidence out of a resolved dispute', async () => {
    prisma.dispute.findUnique.mockResolvedValue({
      id: 'dispute-1',
      status: 'resolved',
      milestone: { contract },
    });
    await expect(
      service.addEvidence(startup, 'dispute-1', { comment: 'Late evidence' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

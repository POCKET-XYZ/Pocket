import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EscrowService } from './escrow.service';
import { MilestonesService } from './milestones.service';

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

const activeContract = {
  id: 'contract-1',
  jobId: 'job-1',
  startupId: 'startup-1',
  specialistId: 'specialist-1',
  status: 'active',
  escrowId: 'CESCROW',
};

function milestone(status: string) {
  return {
    id: 'milestone-1',
    contractId: 'contract-1',
    position: 0,
    amount: new Prisma.Decimal(100),
    status,
    revisionsUsed: 0,
    contract: activeContract,
  };
}

describe('MilestonesService', () => {
  let prisma: {
    milestone: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    deliverable: {
      count: jest.Mock;
      create: jest.Mock;
      findFirstOrThrow: jest.Mock;
      update: jest.Mock;
    };
    contract: { update: jest.Mock };
    job: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };
  let escrow: {
    prepareApprove: jest.Mock;
    submitApprove: jest.Mock;
    milestoneHas: jest.Mock;
    discard: jest.Mock;
    milestoneFlags: jest.Mock;
    release: jest.Mock;
  };
  let service: MilestonesService;

  beforeEach(() => {
    prisma = {
      milestone: {
        findUnique: jest.fn(),
        update: jest.fn(async ({ data }: { data: object }) => ({
          id: 'milestone-1',
          ...data,
        })),
        count: jest.fn().mockResolvedValue(1),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      deliverable: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(async ({ data }: { data: object }) => data),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'deliverable-2' }),
        update: jest.fn(),
      },
      contract: {
        update: jest.fn().mockResolvedValue({ id: 'contract-1', jobId: 'job-1' }),
      },
      job: {
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ revisionRounds: 2 }),
      },
      // A batch runs its operations; an interactive one runs with the client.
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as unknown[]),
      ),
    };
    escrow = {
      prepareApprove: jest.fn().mockResolvedValue({ operationId: 'op-1' }),
      submitApprove: jest.fn().mockResolvedValue({ txHash: 'hash-1' }),
      milestoneHas: jest.fn(),
      discard: jest.fn(),
      // Nothing set on chain yet: the milestone can be approved.
      milestoneFlags: jest.fn().mockResolvedValue({}),
      release: jest.fn(),
    };
    service = new MilestonesService(
      prisma as unknown as PrismaService,
      escrow as unknown as EscrowService,
    );
  });

  describe('deliver', () => {
    it('stores the next version and marks the milestone delivered', async () => {
      prisma.milestone.findUnique.mockResolvedValue(milestone('changes_requested'));

      const deliverable = await service.deliver(specialist, 'milestone-1', {
        url: 'https://example.com/v2',
      });

      expect(deliverable).toEqual(expect.objectContaining({ version: 2 }));
      expect(prisma.milestone.update).toHaveBeenCalledWith({
        where: { id: 'milestone-1' },
        data: { status: 'delivered' },
      });
    });

    it('refuses the startup', async () => {
      prisma.milestone.findUnique.mockResolvedValue(milestone('pending'));
      await expect(
        service.deliver(startup, 'milestone-1', { url: 'https://example.com' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses before the escrow is funded', async () => {
      prisma.milestone.findUnique.mockResolvedValue({
        ...milestone('pending'),
        contract: { ...activeContract, status: 'awaiting_funding' },
      });
      await expect(
        service.deliver(specialist, 'milestone-1', { url: 'https://example.com' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a milestone that is already paid', async () => {
      prisma.milestone.findUnique.mockResolvedValue(milestone('paid'));
      await expect(
        service.deliver(specialist, 'milestone-1', { url: 'https://example.com' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('asks for changes with feedback on the latest version', async () => {
    prisma.milestone.findUnique.mockResolvedValue(milestone('delivered'));

    await service.requestChanges(startup, 'milestone-1', { feedback: 'Add sources' });

    expect(prisma.deliverable.update).toHaveBeenCalledWith({
      where: { id: 'deliverable-2' },
      data: { feedback: 'Add sources' },
    });
    expect(prisma.milestone.updateMany).toHaveBeenCalledWith({
      where: { id: 'milestone-1', status: 'delivered', revisionsUsed: { lt: 2 } },
      data: { status: 'changes_requested', revisionsUsed: { increment: 1 } },
    });
  });

  it('stops asking for changes once the agreed rounds are used', async () => {
    prisma.milestone.findUnique.mockResolvedValue({ ...milestone('delivered'), revisionsUsed: 2 });
    await expect(
      service.requestChanges(startup, 'milestone-1', { feedback: 'One more time please' }),
    ).rejects.toThrow('Approve the work or open a dispute');
    expect(prisma.deliverable.update).not.toHaveBeenCalled();
  });

  it('spends one round when the same request arrives twice', async () => {
    prisma.milestone.findUnique.mockResolvedValue(milestone('delivered'));
    prisma.milestone.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.requestChanges(startup, 'milestone-1', { feedback: 'Add sources' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe('prepareApprove', () => {
    it('prepares the approval when nothing is set on chain', async () => {
      prisma.milestone.findUnique.mockResolvedValue(milestone('delivered'));
      await service.prepareApprove(startup, 'milestone-1');
      expect(escrow.prepareApprove).toHaveBeenCalled();
    });

    it.each([{ disputed: true }, { disputed: true, resolved: true }])(
      'refuses a milestone in dispute on chain (%o), which could never be released',
      async (flags) => {
        prisma.milestone.findUnique.mockResolvedValue(milestone('delivered'));
        escrow.milestoneFlags.mockResolvedValue(flags);
        await expect(
          service.prepareApprove(startup, 'milestone-1'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(escrow.prepareApprove).not.toHaveBeenCalled();
        expect(prisma.milestone.update).not.toHaveBeenCalled();
      },
    );

    it.each([{ approved: true }, { approved: true, released: true }])(
      'syncs a milestone already approved on chain (%o) instead of approving it again',
      async (flags) => {
        prisma.milestone.findUnique.mockResolvedValue(milestone('delivered'));
        escrow.milestoneFlags.mockResolvedValue(flags);
        await expect(
          service.prepareApprove(startup, 'milestone-1'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(escrow.prepareApprove).not.toHaveBeenCalled();
        expect(prisma.milestone.update).toHaveBeenCalledWith({
          where: { id: 'milestone-1' },
          data: expect.objectContaining({ status: 'approved' }),
        });
      },
    );
  });

  describe('submitApprove', () => {
    it('does not send an approval if the milestone was disputed since it was prepared', async () => {
      prisma.milestone.findUnique.mockResolvedValue(milestone('delivered'));
      escrow.milestoneFlags.mockResolvedValue({ disputed: true });
      await expect(
        service.submitApprove(startup, 'milestone-1', 'signed'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(escrow.submitApprove).not.toHaveBeenCalled();
    });

    it('confirms the approval on chain, pays the milestone and completes the contract', async () => {
      prisma.milestone.findUnique
        .mockResolvedValueOnce(milestone('delivered'))
        .mockResolvedValue(milestone('approved'));
      escrow.milestoneHas
        .mockResolvedValueOnce(true) // approved
        .mockResolvedValueOnce(false) // not released yet
        .mockResolvedValueOnce(true); // released
      prisma.milestone.count.mockResolvedValue(0);

      const paid = await service.submitApprove(startup, 'milestone-1', 'signed');

      expect(escrow.release).toHaveBeenCalled();
      expect(paid).toEqual(expect.objectContaining({ status: 'paid' }));
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
        data: expect.objectContaining({ status: 'completed' }),
      });
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'completed' },
      });
    });

    it('does not count an approval the chain does not show', async () => {
      prisma.milestone.findUnique.mockResolvedValue(milestone('delivered'));
      escrow.milestoneHas.mockResolvedValue(false);

      await expect(
        service.submitApprove(startup, 'milestone-1', 'signed'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.milestone.update).not.toHaveBeenCalled();
      expect(escrow.release).not.toHaveBeenCalled();
      // The step is freed, or the startup could never approve again.
      expect(escrow.discard).toHaveBeenCalledWith('hash-1', expect.any(String));
    });

    it('refuses the specialist', async () => {
      prisma.milestone.findUnique.mockResolvedValue(milestone('delivered'));
      await expect(
        service.submitApprove(specialist, 'milestone-1', 'signed'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('retryRelease', () => {
    it('does not release twice when the first release already landed', async () => {
      prisma.milestone.findUnique.mockResolvedValue(milestone('approved'));
      escrow.milestoneHas.mockResolvedValue(true);

      await service.retryRelease(startup, 'milestone-1');

      expect(escrow.release).not.toHaveBeenCalled();
      expect(prisma.milestone.update).toHaveBeenCalledWith({
        where: { id: 'milestone-1' },
        data: expect.objectContaining({ status: 'paid' }),
      });
    });

    it('refuses the specialist', async () => {
      prisma.milestone.findUnique.mockResolvedValue(milestone('approved'));
      await expect(
        service.retryRelease(specialist, 'milestone-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('leaves the contract open while a milestone is still unpaid', async () => {
    prisma.milestone.count.mockResolvedValue(1);
    await service.completeIfDone('contract-1');
    expect(prisma.contract.update).not.toHaveBeenCalled();
  });
});

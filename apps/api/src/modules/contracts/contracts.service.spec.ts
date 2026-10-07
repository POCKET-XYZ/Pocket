import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/types/auth';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StellarService } from '../stellar/stellar.service';
import { JobsService } from '../jobs/jobs.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { ContractsService } from './contracts.service';
import type { CreateContractDto } from './dto/create-contract.dto';
import type { EscrowService } from './escrow.service';

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

function future(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const dto: CreateContractDto = {
  applicationId: 'app-1',
  milestones: [
    {
      title: 'Lead list',
      description: 'A list of leads',
      amount: 100,
      dueDate: future(10),
    },
    {
      title: 'Report',
      description: 'A final report',
      amount: 350.5,
      dueDate: future(20),
    },
  ],
};

describe('ContractsService', () => {
  let prisma: {
    application: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    job: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    contract: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    verificationRequest: { findMany: jest.Mock };
    chainOperation: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let escrow: { deploy: jest.Mock; isFunded: jest.Mock; prepareFund: jest.Mock };
  let stellar: { usdcReadiness: jest.Mock; spendableUsdc: jest.Mock };
  let notifications: { notifyUsers: jest.Mock };
  let service: ContractsService;

  beforeEach(() => {
    prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'app-1',
          jobId: 'job-1',
          specialistId: 'specialist-1',
          status: 'submitted',
          price: new Prisma.Decimal('450.5'),
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          startupId: 'startup-1',
          title: 'Growth plan',
          status: 'open',
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      contract: {
        create: jest
          .fn()
          .mockReturnValue({ id: 'contract-1', specialistId: 'specialist-1' }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(async ({ data }: { data: object }) => ({
          id: 'contract-1',
          ...data,
        })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      chainOperation: { findUnique: jest.fn().mockResolvedValue(null) },
      verificationRequest: {
        // Two different people: each account verified with its own email.
        findMany: jest.fn().mockResolvedValue([
          { userId: 'startup-1', contactEmail: 'startup@example.com' },
          { userId: 'specialist-1', contactEmail: 'specialist@example.com' },
        ]),
      },
      // A batch runs its operations; an interactive one runs with the client.
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as unknown[]),
      ),
    };
    escrow = {
      deploy: jest.fn().mockResolvedValue('CESCROW'),
      isFunded: jest.fn(),
      prepareFund: jest.fn().mockResolvedValue({ operationId: 'op-1' }),
    };
    stellar = {
      usdcReadiness: jest.fn().mockResolvedValue('ready'),
      spendableUsdc: jest.fn(),
    };
    notifications = { notifyUsers: jest.fn() };
    const client = prisma as unknown as PrismaService;
    service = new ContractsService(
      client,
      new JobsService(client),
      escrow as unknown as EscrowService,
      stellar as unknown as StellarService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('create', () => {
    it('hires the applicant with milestones in order and puts the job in progress', async () => {
      await service.create(startup, dto);

      expect(prisma.contract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jobId: 'job-1',
            startupId: 'startup-1',
            specialistId: 'specialist-1',
            milestones: {
              create: [
                expect.objectContaining({ title: 'Lead list', position: 0 }),
                expect.objectContaining({ title: 'Report', position: 1 }),
              ],
            },
          }),
        }),
      );
      expect(prisma.application.updateMany).toHaveBeenCalledWith({
        where: { id: 'app-1', status: 'submitted' },
        data: expect.objectContaining({ status: 'accepted' }),
      });
      expect(prisma.job.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-1', status: 'open' },
        data: { status: 'in_progress' },
      });
      expect(notifications.notifyUsers).toHaveBeenCalledWith(['specialist-1'], {
        type: 'offer_received',
        contractId: 'contract-1',
        jobTitle: 'Growth plan',
      });
    });

    it('hires once when two offers for the same job arrive together', async () => {
      // The other offer took the job between the read and the write.
      prisma.job.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.create(startup, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.contract.create).not.toHaveBeenCalled();
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });

    it('requires the milestones to add up to the agreed price exactly', async () => {
      await expect(
        service.create(startup, {
          ...dto,
          milestones: [{ ...dto.milestones[0], amount: 450.4 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('refuses a hire between two accounts verified with the same email', async () => {
      prisma.verificationRequest.findMany.mockResolvedValue([
        { userId: 'startup-1', contactEmail: 'same@example.com' },
        { userId: 'specialist-1', contactEmail: 'SAME@example.com' },
      ]);
      await expect(service.create(startup, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it('refuses a milestone due in the past', async () => {
      await expect(
        service.create(startup, {
          ...dto,
          milestones: [
            { ...dto.milestones[0], dueDate: '2020-01-01' },
            dto.milestones[1],
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses to hire on another startup's job", async () => {
      prisma.job.findUnique.mockResolvedValue({
        id: 'job-1',
        startupId: 'startup-2',
        status: 'open',
      });
      await expect(service.create(startup, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses an application that was withdrawn', async () => {
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1',
        jobId: 'job-1',
        status: 'withdrawn',
        price: new Prisma.Decimal(450.5),
      });
      await expect(service.create(startup, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('decline', () => {
    it('cancels the contract and opens the job again', async () => {
      prisma.contract.findUnique.mockResolvedValue({
        id: 'contract-1',
        jobId: 'job-1',
        applicationId: 'app-1',
        specialistId: 'specialist-1',
        status: 'awaiting_specialist',
      });

      await service.decline(specialist, 'contract-1');

      expect(prisma.contract.updateMany).toHaveBeenCalledWith({
        where: { id: 'contract-1', status: 'awaiting_specialist', acceptedAt: null },
        data: expect.objectContaining({ status: 'cancelled' }),
      });
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'open' },
      });
      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: expect.objectContaining({ status: 'withdrawn' }),
      });
    });
  });

  describe('withdrawOffer', () => {
    const offer = {
      id: 'contract-1',
      jobId: 'job-1',
      applicationId: 'app-1',
      startupId: 'startup-1',
      specialistId: 'specialist-1',
      status: 'awaiting_specialist',
    };

    it('removes the offer, and the application and the job wait again', async () => {
      prisma.contract.findUnique.mockResolvedValue(offer);
      prisma.contract.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.withdrawOffer(startup, 'contract-1')).resolves.toEqual({
        jobId: 'job-1',
      });
      expect(prisma.contract.deleteMany).toHaveBeenCalledWith({
        where: { id: 'contract-1', status: 'awaiting_specialist', acceptedAt: null },
      });
      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: { status: 'submitted', decidedAt: null },
      });
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'open' },
      });
    });

    it('is refused once the specialist accepted', async () => {
      prisma.contract.findUnique.mockResolvedValue({ ...offer, status: 'awaiting_funding' });
      await expect(service.withdrawOffer(startup, 'contract-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('is refused while the escrow is being deployed', async () => {
      prisma.contract.findUnique.mockResolvedValue(offer);
      prisma.contract.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.withdrawOffer(startup, 'contract-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it('is only for the startup that made it', async () => {
      prisma.contract.findUnique.mockResolvedValue({ ...offer, startupId: 'someone-else' });
      await expect(service.withdrawOffer(startup, 'contract-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('detail', () => {
    const offer = { id: 'contract-1', startupId: 'startup-1', specialistId: 'specialist-1' };

    it('hides the contact emails while the terms are only an offer', async () => {
      prisma.contract.findUnique.mockResolvedValue({ ...offer, status: 'awaiting_specialist' });
      const detail = await service.detail(startup, 'contract-1');
      expect(detail.contacts).toEqual({ startup: null, specialist: null });
      expect(prisma.verificationRequest.findMany).not.toHaveBeenCalled();
    });

    it('shows them once the specialist accepted', async () => {
      prisma.contract.findUnique.mockResolvedValue({ ...offer, status: 'awaiting_funding' });
      const detail = await service.detail(startup, 'contract-1');
      expect(detail.contacts.specialist).toBe('specialist@example.com');
    });

    it('hides them again on terms that were declined', async () => {
      prisma.contract.findUnique.mockResolvedValue({ ...offer, status: 'cancelled' });
      const detail = await service.detail(specialist, 'contract-1');
      expect(detail.contacts).toEqual({ startup: null, specialist: null });
    });
  });

  describe('declining while the escrow is being deployed', () => {
    it('is refused, so the job does not reopen under a live contract', async () => {
      prisma.contract.findUnique.mockResolvedValue({
        id: 'contract-1',
        jobId: 'job-1',
        applicationId: 'app-1',
        specialistId: 'specialist-1',
        status: 'awaiting_specialist',
      });
      prisma.contract.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.decline(specialist, 'contract-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.job.update).not.toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    const waiting = {
      id: 'contract-1',
      jobId: 'job-1',
      startupId: 'startup-1',
      specialistId: 'specialist-1',
      status: 'awaiting_specialist',
    };

    beforeEach(() => {
      prisma.contract.findUnique.mockResolvedValue(waiting);
      prisma.contract.findUniqueOrThrow
        .mockResolvedValueOnce({
          ...waiting,
          job: { title: 'A job', description: 'Scope' },
          startup: { stellarAddress: 'GSTARTUP' },
          milestones: [],
        })
        .mockResolvedValue({ ...waiting, status: 'awaiting_funding', escrowId: 'CESCROW' });
    });

    it('deploys the escrow and turns down the applicants on hold', async () => {
      const accepted = await service.accept(specialist, 'contract-1');

      expect(escrow.deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          startupAddress: 'GSTARTUP',
          specialistAddress: 'GSPECIALIST',
        }),
      );
      expect(accepted).toEqual(
        expect.objectContaining({ status: 'awaiting_funding', escrowId: 'CESCROW' }),
      );
      expect(prisma.contract.updateMany).toHaveBeenCalledWith({
        where: { id: 'contract-1', status: 'awaiting_specialist' },
        data: { status: 'awaiting_funding', escrowId: 'CESCROW', platformFeeBps: 100 },
      });
      expect(prisma.application.updateMany).toHaveBeenCalledWith({
        where: { jobId: 'job-1', status: 'submitted' },
        data: expect.objectContaining({ status: 'rejected' }),
      });
      expect(notifications.notifyUsers).toHaveBeenCalledWith(['startup-1'], {
        type: 'terms_accepted',
        contractId: 'contract-1',
        jobTitle: 'A job',
      });
    });

    it('asks for a USDC trustline first, with a code the client can act on', async () => {
      stellar.usdcReadiness.mockResolvedValue('no_trustline');
      await expect(service.accept(specialist, 'contract-1')).rejects.toMatchObject({
        response: { code: 'USDC_TRUSTLINE_REQUIRED' },
      });
      expect(escrow.deploy).not.toHaveBeenCalled();
    });

    it('does not deploy twice when two accepts race', async () => {
      prisma.contract.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.accept(specialist, 'contract-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(escrow.deploy).not.toHaveBeenCalled();
    });

    it('releases the claim when the deploy fails, so it can be retried', async () => {
      escrow.deploy.mockRejectedValue(new ServiceUnavailableException('down'));
      await expect(service.accept(specialist, 'contract-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
        data: { acceptedAt: null },
      });
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });

    it('refuses the startup', async () => {
      await expect(service.accept(startup, 'contract-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('prepareFund', () => {
    const awaiting = {
      id: 'contract-1',
      startupId: 'startup-1',
      status: 'awaiting_funding',
      escrowId: 'CESCROW',
      amount: new Prisma.Decimal('450.5'),
    };

    beforeEach(() => {
      prisma.contract.findUnique.mockResolvedValue(awaiting);
      prisma.contract.findUniqueOrThrow.mockResolvedValue({
        ...awaiting,
        specialistId: 'specialist-1',
        status: 'active',
      });
    });

    it('does not prepare a second deposit when the escrow already holds the money', async () => {
      escrow.isFunded.mockResolvedValue(true);
      await expect(service.prepareFund(startup, 'contract-1')).rejects.toThrow('already funded');
      expect(prisma.contract.updateMany).toHaveBeenCalledWith({
        where: { id: 'contract-1', status: 'awaiting_funding' },
        data: expect.objectContaining({ status: 'active' }),
      });
      expect(escrow.prepareFund).not.toHaveBeenCalled();
    });

    it('does not prepare a second deposit while one is being confirmed', async () => {
      prisma.chainOperation.findUnique.mockResolvedValue({ txHash: 'pending' });
      await expect(service.prepareFund(startup, 'contract-1')).rejects.toThrow('being confirmed');
      expect(escrow.prepareFund).not.toHaveBeenCalled();
    });

    it('prepares the funding when the wallet can pay it', async () => {
      stellar.spendableUsdc.mockResolvedValue('450.5000000');
      await service.prepareFund(startup, 'contract-1');
      expect(escrow.prepareFund).toHaveBeenCalledWith(awaiting, 'startup-1', 'GSTARTUP');
    });

    it('says how much USDC is missing instead of preparing a transaction that fails', async () => {
      stellar.spendableUsdc.mockResolvedValue('400.0000000');
      await expect(service.prepareFund(startup, 'contract-1')).rejects.toMatchObject({
        response: {
          code: 'INSUFFICIENT_USDC',
          message: expect.stringContaining('Add 50.5 USDC'),
        },
      });
      expect(escrow.prepareFund).not.toHaveBeenCalled();
    });

    it('treats a wallet without USDC as holding none', async () => {
      stellar.spendableUsdc.mockResolvedValue(null);
      await expect(service.prepareFund(startup, 'contract-1')).rejects.toMatchObject({
        response: { code: 'INSUFFICIENT_USDC' },
      });
    });
  });

  describe('syncFunding', () => {
    const awaiting = {
      id: 'contract-1',
      startupId: 'startup-1',
      status: 'awaiting_funding',
      escrowId: 'CESCROW',
      amount: new Prisma.Decimal(450.5),
    };

    it('activates the contract once the escrow holds the full amount', async () => {
      prisma.contract.findUnique.mockResolvedValue(awaiting);
      prisma.contract.findUniqueOrThrow.mockResolvedValue({
        ...awaiting,
        specialistId: 'specialist-1',
        status: 'active',
      });
      escrow.isFunded.mockResolvedValue(true);

      const synced = await service.syncFunding(startup, 'contract-1');

      expect(synced).toEqual(expect.objectContaining({ status: 'active' }));
      expect(notifications.notifyUsers).toHaveBeenCalledWith(['specialist-1'], {
        type: 'escrow_funded',
        contractId: 'contract-1',
      });
    });

    it('tells the specialist once when two syncs activate it together', async () => {
      prisma.contract.findUnique.mockResolvedValue(awaiting);
      prisma.contract.findUniqueOrThrow.mockResolvedValue({ ...awaiting, status: 'active' });
      // The other sync moved it out of awaiting_funding first.
      prisma.contract.updateMany.mockResolvedValue({ count: 0 });
      escrow.isFunded.mockResolvedValue(true);

      await service.syncFunding(startup, 'contract-1');

      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });

    it('waits while the chain does not show the deposit', async () => {
      prisma.contract.findUnique.mockResolvedValue(awaiting);
      escrow.isFunded.mockResolvedValue(false);
      await expect(service.syncFunding(startup, 'contract-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.contract.updateMany).not.toHaveBeenCalled();
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });
  });
});

import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { createHmac } from 'node:crypto';
import * as securityLog from '../../common/security/security-log';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PollarWalletsService } from '../pollar/pollar-wallets.service';
import type { DiditClient, KycDecision } from './didit.client';
import { canonicalJson } from './didit-signature';
import type { SubmitVerificationDto } from './dto/submit-verification.dto';
import {
  KYC_APPROVED_NOTE,
  KYC_DECLINED_NOTE,
  KYC_DUPLICATE_NOTE,
  VerificationService,
} from './verification.service';

const SUBMISSION: SubmitVerificationDto = {
  fullName: 'Ana Rojas',
  contactEmail: 'ana@example.com',
  country: 'CR',
};

const OTHER_USER = '0b6a3f9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    stellarAddress: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
    role: 'specialist',
    verificationStatus: 'not_submitted',
    walletCustody: 'external',
    walletProvider: null,
    pollarUserId: null,
    email: null,
    walletFundedAt: null,
    tokenVersion: 0,
    termsVersion: null,
    termsAcceptedAt: null,
    termsAcceptedIp: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VerificationService', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    verificationRequest: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let didit: {
    enabled: boolean;
    webhookSecret: string;
    createSession: jest.Mock;
    decision: jest.Mock;
  };
  let wallets: { activate: jest.Mock };
  let notifications: { notifyEmail: jest.Mock };
  let service: VerificationService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      verificationRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    // An interactive transaction runs its callback with the client itself.
    prisma.$transaction.mockImplementation((run: (tx: typeof prisma) => unknown) =>
      run(prisma),
    );
    didit = {
      enabled: false,
      webhookSecret: 'whsec-test',
      createSession: jest.fn(),
      decision: jest.fn(),
    };
    wallets = { activate: jest.fn().mockResolvedValue(true) };
    notifications = { notifyEmail: jest.fn() };
    service = new VerificationService(
      prisma as unknown as PrismaService,
      didit as unknown as DiditClient,
      wallets as unknown as PollarWalletsService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('without identity checks', () => {
    it('approves the account as soon as the details arrive', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.verificationRequest.create.mockReturnValue({
        id: 'req-1',
        userId: 'user-1',
        contactEmail: SUBMISSION.contactEmail,
      });

      const request = await service.submit('user-1', SUBMISSION);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-1',
          verificationStatus: { in: ['not_submitted', 'rejected', 'pending'] },
        },
        data: { verificationStatus: 'approved' },
      });
      const { data } = prisma.verificationRequest.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).toMatchObject({ ...SUBMISSION, userId: 'user-1', status: 'approved' });
      expect(data.reviewedAt).toBe(data.submittedAt);
      expect(request).toMatchObject({ id: 'req-1' });
    });

    it('activates the wallet and tells the user by email', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.verificationRequest.create.mockReturnValue({
        id: 'req-1',
        userId: 'user-1',
        contactEmail: SUBMISSION.contactEmail,
      });

      await service.submit('user-1', SUBMISSION);

      expect(wallets.activate).toHaveBeenCalledWith('user-1');
      expect(notifications.notifyEmail).toHaveBeenCalledWith(SUBMISSION.contactEmail, {
        type: 'verification_approved',
      });
    });

    it('approves an account left waiting for a check that is no longer set up', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ verificationStatus: 'pending' }));
      prisma.verificationRequest.create.mockReturnValue({ id: 'req-3', userId: 'user-1' });
      await expect(service.submit('user-1', SUBMISSION)).resolves.toMatchObject({
        id: 'req-3',
      });
      expect(wallets.activate).toHaveBeenCalledWith('user-1');
    });
  });

  it('requires a company name from startups', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'startup' }));
    await expect(service.submit('user-1', SUBMISSION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lets a startup submit with a company name', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'startup' }));
    prisma.verificationRequest.create.mockReturnValue({ id: 'req-2', userId: 'user-1' });
    await expect(
      service.submit('user-1', { ...SUBMISSION, companyName: 'Acme' }),
    ).resolves.toMatchObject({ id: 'req-2' });
  });

  it('blocks a second submission once approved', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ verificationStatus: 'approved' }));
    await expect(service.submit('user-1', SUBMISSION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.verificationRequest.create).not.toHaveBeenCalled();
    expect(wallets.activate).not.toHaveBeenCalled();
  });

  it('creates one request when the same user submits twice at once', async () => {
    // Both read the user as not submitted; the other submission moved it first.
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.submit('user-1', SUBMISSION)).rejects.toThrow(
      'Ya enviaste tus datos',
    );
    expect(prisma.verificationRequest.create).not.toHaveBeenCalled();
    expect(wallets.activate).not.toHaveBeenCalled();
  });

  it('never verifies managers', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'manager' }));
    await expect(service.submit('user-1', SUBMISSION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('with identity checks through Didit', () => {
    const PENDING = {
      id: 'req-1',
      userId: 'user-1',
      status: 'pending',
      contactEmail: 'ana@example.com',
      kycSessionId: 'sess-1',
      kycStatus: 'In Progress',
      kycConsentAt: new Date(),
    };
    let events: jest.SpyInstance;

    function decision(overrides: Partial<KycDecision> = {}): KycDecision {
      return {
        sessionId: 'sess-1',
        status: 'Approved',
        vendorData: 'user-1',
        sharedWith: [],
        blocklisted: false,
        reasons: [],
        ...overrides,
      };
    }

    beforeEach(() => {
      didit.enabled = true;
      events = jest
        .spyOn(securityLog, 'securityEvent')
        .mockImplementation(() => undefined);
      prisma.verificationRequest.findUnique.mockResolvedValue(PENDING);
      prisma.verificationRequest.findUniqueOrThrow.mockResolvedValue({
        ...PENDING,
        status: 'approved',
      });
    });

    afterEach(() => events.mockRestore());

    describe('the details', () => {
      it('leave the account waiting for the check, with no wallet yet', async () => {
        prisma.user.findUnique.mockResolvedValue(makeUser());
        prisma.verificationRequest.create.mockReturnValue({ id: 'req-1', userId: 'user-1' });

        await service.submit('user-1', SUBMISSION);

        expect(prisma.user.updateMany).toHaveBeenCalledWith({
          where: { id: 'user-1', verificationStatus: { in: ['not_submitted', 'rejected'] } },
          data: { verificationStatus: 'pending' },
        });
        const { data } = prisma.verificationRequest.create.mock.calls[0][0] as {
          data: Record<string, unknown>;
        };
        expect(data).toMatchObject({ status: 'pending', reviewedAt: null });
        expect(wallets.activate).not.toHaveBeenCalled();
        expect(notifications.notifyEmail).not.toHaveBeenCalled();
      });

      it('cannot be sent again while the check is pending', async () => {
        prisma.user.findUnique.mockResolvedValue(makeUser({ verificationStatus: 'pending' }));
        await expect(service.submit('user-1', SUBMISSION)).rejects.toThrow(
          'falta verificar tu identidad',
        );
      });

      it('can be sent again after a decline', async () => {
        prisma.user.findUnique.mockResolvedValue(
          makeUser({ verificationStatus: 'rejected' }),
        );
        prisma.verificationRequest.create.mockReturnValue({ id: 'req-4', userId: 'user-1' });
        await expect(service.submit('user-1', SUBMISSION)).resolves.toMatchObject({
          id: 'req-4',
        });
      });
    });

    describe('starting it', () => {
      it('is refused when identity checks are off', async () => {
        didit.enabled = false;
        await expect(service.startKyc('user-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(didit.createSession).not.toHaveBeenCalled();
      });

      it('needs the details first', async () => {
        prisma.verificationRequest.findFirst.mockResolvedValue(null);
        await expect(service.startKyc('user-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        prisma.verificationRequest.findFirst.mockResolvedValue({
          ...PENDING,
          status: 'approved',
        });
        await expect(service.startKyc('user-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(didit.createSession).not.toHaveBeenCalled();
      });

      it('is not restarted while Didit reviews the case', async () => {
        prisma.verificationRequest.findFirst.mockResolvedValue({
          ...PENDING,
          kycStatus: 'In Review',
        });
        await expect(service.startKyc('user-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });

      it('records the consent and a new session, and hands back its link', async () => {
        prisma.verificationRequest.findFirst.mockResolvedValue({
          ...PENDING,
          kycSessionId: null,
          kycStatus: null,
          kycConsentAt: null,
        });
        didit.createSession.mockResolvedValue({
          sessionId: 'sess-2',
          url: 'https://verify.didit.me/session/abc',
        });

        await expect(service.startKyc('user-1')).resolves.toEqual({
          url: 'https://verify.didit.me/session/abc',
        });
        expect(didit.createSession).toHaveBeenCalledWith('user-1', 'req-1');
        expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'req-1', kycConsentAt: null },
          data: { kycConsentAt: expect.any(Date) as Date },
        });
        expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'req-1', status: 'pending' },
          data: expect.objectContaining({
            kycSessionId: 'sess-2',
            kycStatus: 'Not Started',
          }) as object,
        });
      });

      it('continues an unfinished session without resetting it', async () => {
        prisma.verificationRequest.findFirst.mockResolvedValue(PENDING);
        didit.createSession.mockResolvedValue({
          sessionId: 'sess-1',
          url: 'https://verify.didit.me/session/abc',
        });
        await service.startKyc('user-1');
        expect(prisma.verificationRequest.updateMany).not.toHaveBeenCalled();
      });
    });

    describe('acting on the outcome', () => {
      it('approves the account and activates its wallet', async () => {
        didit.decision.mockResolvedValue(decision());

        await service.applyKycDecision('sess-1');

        expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'req-1', status: 'pending' },
          data: expect.objectContaining({
            status: 'approved',
            reviewNote: KYC_APPROVED_NOTE,
            kycStatus: 'Approved',
          }) as object,
        });
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { verificationStatus: 'approved' },
        });
        expect(wallets.activate).toHaveBeenCalledWith('user-1');
        expect(notifications.notifyEmail).toHaveBeenCalledWith('ana@example.com', {
          type: 'verification_approved',
        });
      });

      it('turns down a declined check, so the person can try again', async () => {
        prisma.verificationRequest.findUniqueOrThrow.mockResolvedValue({
          ...PENDING,
          status: 'rejected',
        });
        didit.decision.mockResolvedValue(
          decision({ status: 'Declined', reasons: ['Document expired'] }),
        );

        await service.applyKycDecision('sess-1');

        expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'req-1', status: 'pending' },
          data: expect.objectContaining({
            status: 'rejected',
            reviewNote: KYC_DECLINED_NOTE,
            kycStatus: 'Declined',
            kycReason: 'Document expired',
          }) as object,
        });
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { verificationStatus: 'rejected' },
        });
        expect(wallets.activate).not.toHaveBeenCalled();
      });

      it('waits for a review in Didit, and tells the team once', async () => {
        didit.decision.mockResolvedValue(
          decision({ status: 'In Review', reasons: ['Possible AML match'] }),
        );

        await service.applyKycDecision('sess-1');

        expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'req-1',
            status: 'pending',
            kycSessionId: 'sess-1',
            OR: [{ kycStatus: null }, { kycStatus: { not: 'In Review' } }],
          },
          data: expect.objectContaining({
            kycStatus: 'In Review',
            kycReason: 'Possible AML match',
          }) as object,
        });
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(wallets.activate).not.toHaveBeenCalled();
        expect(events).toHaveBeenCalledWith(
          'kyc_decision',
          expect.objectContaining({ decision: 'review' }),
          'alert',
        );

        // The same status again (a refresh after the webhook): no second alert.
        events.mockClear();
        prisma.verificationRequest.updateMany.mockResolvedValue({ count: 0 });
        await service.applyKycDecision('sess-1');
        expect(events).not.toHaveBeenCalled();
      });

      it.each([
        ['the same document or face on another live account', { sharedWith: [OTHER_USER] }, 1],
        ['a hit on the blocklist', { blocklisted: true }, 0],
      ])('turns down an approval with %s', async (_case, overrides, live) => {
        prisma.user.count.mockResolvedValue(live);
        prisma.verificationRequest.findUniqueOrThrow.mockResolvedValue({
          ...PENDING,
          status: 'rejected',
        });
        didit.decision.mockResolvedValue(decision(overrides));

        await service.applyKycDecision('sess-1');

        expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'req-1', status: 'pending' },
          data: expect.objectContaining({
            status: 'rejected',
            reviewNote: KYC_DUPLICATE_NOTE,
          }) as object,
        });
        expect(wallets.activate).not.toHaveBeenCalled();
      });

      it('approves when the other account was deleted, or is not a Pocket user', async () => {
        prisma.user.count.mockResolvedValue(0);
        didit.decision.mockResolvedValue(
          decision({ sharedWith: [OTHER_USER, 'someone-from-another-app'] }),
        );

        await service.applyKycDecision('sess-1');

        expect(prisma.user.count).toHaveBeenCalledWith({
          where: { id: { in: [OTHER_USER] }, deletedAt: null },
        });
        expect(wallets.activate).toHaveBeenCalledWith('user-1');
      });

      it('only records the status of a session still going or abandoned', async () => {
        didit.decision.mockResolvedValue(decision({ status: 'Abandoned' }));
        await service.applyKycDecision('sess-1');
        expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
          where: expect.objectContaining({ id: 'req-1', kycSessionId: 'sess-1' }) as object,
          data: expect.objectContaining({ kycStatus: 'Abandoned', kycReason: null }) as object,
        });
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('ignores a session that belongs to someone else, and raises an alert', async () => {
        didit.decision.mockResolvedValue(decision({ vendorData: 'user-2' }));

        await service.applyKycDecision('sess-1');

        expect(prisma.verificationRequest.updateMany).not.toHaveBeenCalled();
        expect(wallets.activate).not.toHaveBeenCalled();
        expect(events).toHaveBeenCalledWith(
          'kyc_webhook_refused',
          expect.objectContaining({ requestId: 'req-1' }),
          'alert',
        );
      });

      it('does not ask Didit about sessions it does not know or already decided', async () => {
        prisma.verificationRequest.findUnique.mockResolvedValue(null);
        await service.applyKycDecision('sess-unknown');
        prisma.verificationRequest.findUnique.mockResolvedValue({
          ...PENDING,
          status: 'approved',
        });
        await service.applyKycDecision('sess-1');
        expect(didit.decision).not.toHaveBeenCalled();
      });

      it('decides once when a webhook and a refresh arrive together', async () => {
        didit.decision.mockResolvedValue(decision());
        // The other one moved the request out of pending first.
        prisma.verificationRequest.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.applyKycDecision('sess-1')).resolves.toBeUndefined();
        expect(wallets.activate).not.toHaveBeenCalled();
      });
    });

    describe('webhooks', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        session_id: 'sess-1',
        status: 'Approved',
        vendor_data: 'user-1',
        timestamp: now,
        webhook_type: 'status.updated',
      };
      const signature = createHmac('sha256', 'whsec-test')
        .update(canonicalJson(payload))
        .digest('hex');

      it('acts on an authentic one, reading the outcome from Didit', async () => {
        didit.decision.mockResolvedValue(decision());
        await expect(
          service.handleKycWebhook(payload, {
            'x-timestamp': String(now),
            'x-signature-v2': signature,
          }),
        ).resolves.toEqual({ received: true });
        expect(didit.decision).toHaveBeenCalledWith('sess-1');
      });

      it('refuses one with a wrong signature', async () => {
        await expect(
          service.handleKycWebhook(
            { ...payload, vendor_data: 'user-2' },
            { 'x-timestamp': String(now), 'x-signature-v2': signature },
          ),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(didit.decision).not.toHaveBeenCalled();
      });

      it('does not exist when identity checks are off', async () => {
        didit.enabled = false;
        await expect(
          service.handleKycWebhook(payload, {
            'x-timestamp': String(now),
            'x-signature-v2': signature,
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });
});

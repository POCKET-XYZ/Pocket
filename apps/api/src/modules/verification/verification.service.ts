import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Prisma,
  type User,
  type VerificationRequest,
  type VerificationStatus,
} from '@prisma/client';
import { securityEvent } from '../../common/security/security-log';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PollarWalletsService } from '../pollar/pollar-wallets.service';
import { DiditClient } from './didit.client';
import { isAuthenticDiditWebhook, type DiditWebhookHeaders } from './didit-signature';
import { SubmitVerificationDto } from './dto/submit-verification.dto';

/** What a person reads when Didit could not verify them. */
export const KYC_DECLINED_NOTE =
  'No pudimos verificar tu identidad. Revisa que tu documento esté vigente y que las fotos se vean completas y nítidas, y vuelve a intentarlo.';

/** What a person reads when their document or face is already on another account. */
export const KYC_DUPLICATE_NOTE =
  'Este documento o esta cara ya se verificaron en otra cuenta de Pocket. Cada persona puede tener una sola cuenta. Si la otra cuenta es tuya, entra con ella; si crees que es un error, escríbenos.';

/** The review note an approval by the identity check leaves. */
export const KYC_APPROVED_NOTE = 'Identidad verificada con Didit.';

/** Fields of the identity check written together with a decision. */
type KycFields = Pick<
  Prisma.VerificationRequestUpdateManyMutationInput,
  'kycStatus' | 'kycReason' | 'kycCheckedAt'
>;

/** The details a verification request carries, as the person sent them. */
export type VerificationDetails = Pick<
  Prisma.VerificationRequestUncheckedCreateInput,
  | 'fullName'
  | 'contactEmail'
  | 'country'
  | 'linkedinUrl'
  | 'websiteUrl'
  | 'companyName'
  | 'companyRegistrationId'
  | 'note'
>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly didit: DiditClient,
    private readonly wallets: PollarWalletsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Whether an identity check through Didit activates accounts. When it does
   * not (no Didit keys: local runs, tests), completing the details does.
   */
  get kycEnabled(): boolean {
    return this.didit.enabled;
  }

  /**
   * Complete the account details. With Didit on, the account waits for the
   * identity check that comes next; without it, sending them approves the
   * account on the spot. Allowed when the user has never sent them or was
   * turned down, so a declined person can fix them and try again; without
   * Didit, also when the account waits for a check that is no longer there.
   */
  async submit(userId: string, dto: SubmitVerificationDto): Promise<VerificationRequest> {
    const user = await this.getUser(userId);

    if (user.role === 'manager') {
      throw new BadRequestException('Los managers no pasan por la verificación');
    }
    if (user.verificationStatus === 'approved') {
      throw new BadRequestException('Tu cuenta ya está verificada');
    }
    if (user.verificationStatus === 'pending' && this.kycEnabled) {
      throw new BadRequestException('Ya enviaste tus datos: falta verificar tu identidad');
    }
    if (user.role === 'startup' && !dto.companyName) {
      throw new BadRequestException(
        'El nombre de la empresa es obligatorio para las startups',
      );
    }

    const status = this.kycEnabled ? 'pending' : 'approved';
    const from: VerificationStatus[] = this.kycEnabled
      ? ['not_submitted', 'rejected']
      : ['not_submitted', 'rejected', 'pending'];
    const request = await this.prisma.$transaction(async (tx) => {
      // Claim the user: of two submissions sent at once, the second finds the
      // account moved on already.
      const claimed = await tx.user.updateMany({
        where: { id: userId, verificationStatus: { in: from } },
        data: { verificationStatus: status },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Ya enviaste tus datos');
      }
      const now = new Date();
      return tx.verificationRequest.create({
        data: {
          ...dto,
          userId,
          status,
          submittedAt: now,
          reviewedAt: status === 'approved' ? now : null,
        } satisfies Prisma.VerificationRequestUncheckedCreateInput,
      });
    });

    if (status === 'approved') await this.afterApproval(request);
    return request;
  }

  /** The user's latest request, or null when they never submitted one. */
  latestFor(userId: string): Promise<VerificationRequest | null> {
    return this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  /**
   * The link to Didit's identity check for the user's pending request, once
   * the person gave their express consent (the controller requires it). Didit
   * hands back the unfinished session when there is one, so a person who left
   * halfway continues where they were.
   */
  async startKyc(userId: string): Promise<{ url: string }> {
    if (!this.kycEnabled) {
      throw new BadRequestException('La verificación de identidad no está activada');
    }
    const request = await this.latestFor(userId);
    if (!request || request.status !== 'pending') {
      throw new BadRequestException('Primero completa los datos de tu cuenta');
    }
    if (request.kycStatus === 'In Review') {
      throw new BadRequestException(
        'Tu verificación está en revisión. Te avisamos cuando termine.',
      );
    }

    if (!request.kycConsentAt) {
      await this.prisma.verificationRequest.updateMany({
        where: { id: request.id, kycConsentAt: null },
        data: { kycConsentAt: new Date() },
      });
    }
    const { sessionId, url } = await this.didit.createSession(userId, request.id);
    if (sessionId !== request.kycSessionId) {
      // A new session: the last one ended (abandoned or expired) or never existed.
      await this.prisma.verificationRequest.updateMany({
        where: { id: request.id, status: 'pending' },
        data: {
          kycSessionId: sessionId,
          kycStatus: 'Not Started',
          kycReason: null,
          kycCheckedAt: new Date(),
        },
      });
    }
    return { url };
  }

  /**
   * Read the user's identity check back from Didit: when they return from
   * Didit's page, and whenever a webhook is late or cannot reach the API.
   */
  async refreshKyc(userId: string): Promise<VerificationRequest | null> {
    const request = await this.latestFor(userId);
    if (this.kycEnabled && request?.status === 'pending' && request.kycSessionId) {
      await this.applyKycDecision(request.kycSessionId);
      return this.latestFor(userId);
    }
    return request;
  }

  /**
   * A webhook from Didit. It is only trusted to be authentic and recent, and
   * only its session id is used: the outcome is then read from Didit's API.
   */
  async handleKycWebhook(
    payload: unknown,
    headers: DiditWebhookHeaders,
    rawBody?: Buffer,
  ): Promise<{ received: true }> {
    if (!this.kycEnabled) throw new NotFoundException();
    if (
      !isAuthenticDiditWebhook({
        secret: this.didit.webhookSecret,
        headers,
        payload,
        rawBody,
      })
    ) {
      securityEvent('kyc_webhook_refused', { reason: 'signature or timestamp' }, 'warn');
      throw new UnauthorizedException('La firma del aviso no es válida');
    }
    const sessionId = (payload as { session_id?: unknown } | null)?.session_id;
    if (typeof sessionId === 'string' && sessionId) {
      await this.applyKycDecision(sessionId);
    }
    return { received: true };
  }

  /**
   * Act on a session's outcome as Didit reports it now. Running it twice, or
   * for a webhook and a refresh at once, decides the request only once.
   */
  async applyKycDecision(sessionId: string): Promise<void> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { kycSessionId: sessionId },
    });
    // A test delivery, an old session, or one already decided: nothing to do.
    if (!request || request.status !== 'pending') return;

    const decision = await this.didit.decision(sessionId);
    // The session must be the one Pocket opened for this very user.
    if (decision.sessionId !== sessionId || decision.vendorData !== request.userId) {
      securityEvent(
        'kyc_webhook_refused',
        { requestId: request.id, reason: 'session does not belong to the request' },
        'alert',
      );
      return;
    }

    const checkedAt = new Date();
    const didit = decision.reasons.join('; ');

    if (decision.status === 'Approved') {
      // One person, one account: the same document or face on another live
      // account, or on Didit's blocklist, is turned down.
      const duplicate = await this.onAnotherLiveAccount(decision.sharedWith);
      if (decision.blocklisted || duplicate) {
        await this.decide(request.id, 'rejected', KYC_DUPLICATE_NOTE, {
          kycStatus: 'Declined',
          kycReason: decision.blocklisted
            ? 'Didit found the document or the face on its blocklist.'
            : 'The same document or face was verified on another Pocket account.',
          kycCheckedAt: checkedAt,
        }).catch(alreadyDecided);
        return;
      }
      await this.decide(request.id, 'approved', KYC_APPROVED_NOTE, {
        kycStatus: 'Approved',
        kycReason: null,
        kycCheckedAt: checkedAt,
      }).catch(alreadyDecided);
      return;
    }

    if (decision.status === 'Declined') {
      await this.decide(request.id, 'rejected', KYC_DECLINED_NOTE, {
        kycStatus: 'Declined',
        kycReason: didit || null,
        kycCheckedAt: checkedAt,
      }).catch(alreadyDecided);
      return;
    }

    // Still going, held for a review in Didit's console, or ended without a
    // result: only the status moves, and the person can continue or start again.
    const moved = await this.prisma.verificationRequest.updateMany({
      where: {
        id: request.id,
        status: 'pending',
        kycSessionId: sessionId,
        OR: [{ kycStatus: null }, { kycStatus: { not: decision.status } }],
      },
      data: {
        kycStatus: decision.status,
        kycReason:
          decision.status === 'In Review' ? didit || 'Didit asked for a manual review.' : null,
        kycCheckedAt: checkedAt,
      },
    });
    if (moved.count === 1 && decision.status === 'In Review') {
      // Somebody has to open Didit's console and decide: tell the team now.
      securityEvent(
        'kyc_decision',
        { requestId: request.id, userId: request.userId, decision: 'review', sessionId },
        'alert',
      );
    }
  }

  /**
   * Approve or turn down a pending request on the identity check's word.
   * Approving also tries again to activate a Pollar wallet that sign-in could
   * not.
   */
  private async decide(
    requestId: string,
    status: 'approved' | 'rejected',
    note: string,
    kyc: KycFields,
  ): Promise<VerificationRequest> {
    const decided = await this.prisma.$transaction(async (tx) => {
      // Claim the request: of a webhook and a refresh at once, only one moves
      // it out of pending.
      const claimed = await tx.verificationRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status, reviewNote: note, reviewedAt: new Date(), ...kyc },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Esta solicitud ya fue revisada');
      }
      const request = await tx.verificationRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      await tx.user.update({
        where: { id: request.userId },
        data: { verificationStatus: status },
      });
      return request;
    });

    securityEvent('kyc_decision', {
      requestId,
      userId: decided.userId,
      decision: status,
    });
    if (status === 'approved') await this.afterApproval(decided);
    return decided;
  }

  /** What every approval does: say so, and make sure the wallet is on the network. */
  private async afterApproval(request: VerificationRequest): Promise<void> {
    this.notifications.notifyEmail(request.contactEmail, { type: 'verification_approved' });
    await this.wallets.activate(request.userId);
  }

  /** Whether any of these Pocket users is a live account (not deleted). */
  private async onAnotherLiveAccount(userIds: string[]): Promise<boolean> {
    // Didit may hold sessions from other apps on the same account, whose
    // vendor data is not a Pocket user id.
    const ids = userIds.filter((id) => UUID.test(id));
    if (ids.length === 0) return false;
    const live = await this.prisma.user.count({
      where: { id: { in: ids }, deletedAt: null },
    });
    return live > 0;
  }

  private async getUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('No encontramos al usuario');
    return user;
  }
}

/** A webhook and a refresh can race to the same decision: the second one is not an error. */
function alreadyDecided(error: unknown): void {
  if (error instanceof BadRequestException) return;
  throw error;
}

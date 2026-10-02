import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { contactEmails } from '../users/contact-emails';
import { render, type NotificationEvent } from './templates';

const RESEND_URL = 'https://api.resend.com/emails';

/** Long enough for Resend, short enough that a hung call does not pile up. */
const SEND_TIMEOUT_MS = 10_000;

/**
 * Transactional emails. An email never blocks or fails the action that
 * triggered it: callers fire it after their database change is committed,
 * the `notify` methods return at once, and every error is caught and logged
 * here. One attempt per email, no retry loops. Logs carry the event and the
 * user id, never the address or the body.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly apiKey: string;
  private readonly from: string;
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('email.resendApiKey') ?? '';
    this.from = config.get<string>('email.from') ?? '';
    this.webUrl = config.get<string>('email.webPublicUrl') ?? '';
  }

  /** Email each user at their verified contact email. Users without one get nothing. */
  notifyUsers(userIds: string[], event: NotificationEvent): void {
    void this.sendToUsers(userIds, event);
  }

  /** Email an address already at hand, such as the one of the request just reviewed. */
  notifyEmail(to: string, event: NotificationEvent): void {
    void this.send(to, event);
  }

  /** Awaitable form of notifyUsers. Never rejects. */
  async sendToUsers(userIds: string[], event: NotificationEvent): Promise<void> {
    if (!this.apiKey) {
      this.logger.debug(`Email ${event.type} not sent: RESEND_API_KEY is not set`);
      return;
    }
    try {
      const emails = await contactEmails(this.prisma, userIds);
      await Promise.all(
        userIds.map((userId) => {
          const to = emails.get(userId);
          return to ? this.send(to, event, userId) : Promise.resolve();
        }),
      );
    } catch (error) {
      this.logger.warn(`Email ${event.type} not sent: ${describe(error)}`);
    }
  }

  /** Awaitable form of notifyEmail. Never rejects. */
  async send(to: string, event: NotificationEvent, userId?: string): Promise<void> {
    const who = userId ? ` to user ${userId}` : '';
    if (!this.apiKey) {
      this.logger.debug(`Email ${event.type} not sent: RESEND_API_KEY is not set`);
      return;
    }
    try {
      const email = render(event, this.webUrl);
      const response = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to: [to], ...email }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!response.ok) {
        // The status says enough; Resend's error body can echo the address.
        this.logger.warn(
          `Email ${event.type}${who} refused by Resend: HTTP ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Email ${event.type}${who} not sent: ${describe(error)}`);
    }
  }
}

/** The error's kind and message, which never include the address or body. */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}

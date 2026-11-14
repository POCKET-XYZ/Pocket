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

  /**
   * Email each user at their verified contact email, or else at the email
   * they signed in with. Users with neither get nothing.
   */
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
      const emails = await this.emailsOf(userIds);
      await Promise.all(
        userIds.map((userId) => {
          const to = emails.get(userId);
          if (!to) {
            this.logger.log(`Email ${event.type} to user ${userId} not sent: no email on file`);
            return Promise.resolve();
          }
          return this.send(to, event, userId);
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
        return;
      }
      // Resend's id finds the email, and what became of it, in its dashboard.
      const { id } = (await response.json().catch(() => ({}))) as { id?: string };
      this.logger.log(`Email ${event.type}${who} accepted by Resend: ${id ?? 'no id'}`);
    } catch (error) {
      this.logger.warn(`Email ${event.type}${who} not sent: ${describe(error)}`);
    }
  }

  /**
   * Where to email each user. The contact email of their verification comes
   * first. Without one (a specialist can apply and get offers before sending
   * their details), the email they signed in with, which the login provider
   * already verified. Only for these emails: the other party of a contract is
   * shown the contact email alone.
   */
  private async emailsOf(userIds: string[]): Promise<Map<string, string>> {
    const emails = await contactEmails(this.prisma, userIds);
    const missing = userIds.filter((userId) => !emails.has(userId));
    if (missing.length === 0) return emails;
    const users = await this.prisma.user.findMany({
      where: { id: { in: missing }, email: { not: null }, deletedAt: null },
      select: { id: true, email: true },
    });
    for (const user of users) {
      if (user.email) emails.set(user.id, user.email);
    }
    return emails;
  }
}

/** The error's kind and message, which never include the address or body. */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}

import { Logger } from '@nestjs/common';

/** What the security log records. Each line is one JSON object. */
export type SecurityEventName =
  | 'login'
  | 'logout'
  | 'denied'
  | 'rate_limited'
  | 'platform_signed'
  | 'platform_refused'
  | 'manager_decision'
  | 'unrecorded_platform_operation'
  | 'platform_balance_low'
  | 'account_deleted'
  | 'data_exported';

type Fields = Record<string, string | number | boolean | null | undefined>;

const logger = new Logger('Security');

/**
 * Record a security event. Never pass tokens, signed transactions or secrets:
 * ids, addresses, hashes and the route are enough to follow what happened.
 * Alerts also go to SECURITY_ALERT_WEBHOOK_URL (a Slack or Discord incoming
 * webhook), when it is set, because an alert only in a log is read too late.
 */
export function securityEvent(
  event: SecurityEventName,
  fields: Fields = {},
  level: 'log' | 'warn' | 'alert' = 'log',
): void {
  const line = JSON.stringify({ event, ...fields });
  if (level === 'alert') {
    logger.error(line);
    void sendAlert(`Pocket security alert: ${line}`);
  } else {
    logger[level](line);
  }
}

async function sendAlert(text: string): Promise<void> {
  const url = process.env.SECURITY_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    // Slack reads `text`, Discord reads `content`.
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    logger.error(`Could not deliver the alert: ${String(error)}`);
  }
}

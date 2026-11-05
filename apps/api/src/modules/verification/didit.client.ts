import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { securityEvent } from '../../common/security/security-log';

/** The team hears about Didit refusing Pocket at most this often. */
const ALERT_EVERY_MS = 30 * 60 * 1000;

/** Didit's answer takes a few hundred milliseconds; past this something is wrong. */
const TIMEOUT_MS = 10_000;

/** Whether identity checks are on: config validation makes the three all or none. */
export function isKycEnabled(config: ConfigService): boolean {
  return Boolean(
    config.get<string>('kyc.diditApiKey') &&
    config.get<string>('kyc.diditWorkflowId') &&
    config.get<string>('kyc.diditWebhookSecret'),
  );
}

/** Statuses as Didit names them in its docs. */
export type KycStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Approved'
  | 'Declined'
  | 'In Review'
  | 'Resubmitted'
  | 'Abandoned'
  | 'Expired'
  | 'Kyc Expired';

/** A session's outcome, read back from Didit rather than from a webhook. */
export interface KycDecision {
  sessionId: string;
  /** A KycStatus, or whatever new status Didit adds, as written there. */
  status: string;
  /** The Pocket user the session was created for. */
  vendorData: string | null;
  /**
   * Other users whose sessions showed the same document or the same face, as
   * Didit matches them across sessions. One person, one account.
   */
  sharedWith: string[];
  /** Whether Didit found the document or the face on its blocklist. */
  blocklisted: boolean;
  /** Didit's own short explanations, for the manager; in English. */
  reasons: string[];
}

/** The features of a decision that carry cross-session matches and warnings. */
const FEATURES = [
  'id_verifications',
  'liveness_checks',
  'face_matches',
  'aml_screenings',
  'ip_analyses',
] as const;

/** Where a feature lists sessions that saw the same document or face. */
const MATCH_LISTS = ['matches', 'document_selfie_face_matches'] as const;

/**
 * Didit's docs write statuses both as "In Review" and as "IN_REVIEW": both
 * read as the first.
 */
export function normalizeKycStatus(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The fields of a decision Pocket acts on; everything else stays with Didit. */
export function readDecision(body: Record<string, unknown>): KycDecision {
  const vendorData = typeof body.vendor_data === 'string' ? body.vendor_data : null;
  const shared = new Set<string>();
  const reasons = new Set<string>();
  let blocklisted = false;
  // Webhooks nest the checks under `decision`; the decision endpoint may not.
  const checks =
    body.decision !== null && typeof body.decision === 'object'
      ? (body.decision as Record<string, unknown>)
      : body;

  for (const feature of FEATURES) {
    const items = checks[feature];
    if (!Array.isArray(items)) continue;
    for (const item of items as Record<string, unknown>[]) {
      for (const list of MATCH_LISTS) {
        const matches = item?.[list];
        if (!Array.isArray(matches)) continue;
        for (const match of matches as Record<string, unknown>[]) {
          if (match?.is_blocklisted === true) blocklisted = true;
          const other = match?.vendor_data;
          if (typeof other === 'string' && other && other !== vendorData)
            shared.add(other);
        }
      }
      const warnings = item?.warnings;
      if (Array.isArray(warnings)) {
        for (const warning of warnings as Record<string, unknown>[]) {
          const text = warning?.short_description ?? warning?.risk;
          if (typeof text === 'string' && text) reasons.add(text);
        }
      }
    }
  }

  return {
    sessionId: typeof body.session_id === 'string' ? body.session_id : '',
    status: normalizeKycStatus(body.status),
    vendorData,
    sharedWith: [...shared],
    blocklisted,
    reasons: [...reasons].slice(0, 5),
  };
}

/**
 * Didit's hosted identity check: Pocket opens a session for a user, sends them
 * to Didit's page (ID, selfie, liveness, face match) and reads the
 * decision back. Only the API talks to Didit: the key never reaches a browser.
 *
 * Endpoints follow https://docs.didit.me/sessions-api/create-session and
 * https://docs.didit.me/sessions-api/retrieve-session (v3).
 */
@Injectable()
export class DiditClient {
  /** When the team was last told Didit refused Pocket. */
  private lastAlert = 0;
  private readonly logger = new Logger(DiditClient.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly workflowId: string;
  readonly webhookSecret: string;
  private readonly webUrl: string;

  constructor(config: ConfigService) {
    this.apiUrl = config.get<string>('kyc.diditApiUrl') ?? '';
    this.apiKey = config.get<string>('kyc.diditApiKey') ?? '';
    this.workflowId = config.get<string>('kyc.diditWorkflowId') ?? '';
    this.webhookSecret = config.get<string>('kyc.diditWebhookSecret') ?? '';
    this.webUrl = config.get<string>('email.webPublicUrl') ?? '';
  }

  /** Whether identity checks are turned on; config validation makes it all or nothing. */
  get enabled(): boolean {
    return Boolean(this.apiKey && this.workflowId && this.webhookSecret);
  }

  /**
   * A session for this user. Didit hands back the unfinished one when there
   * is one, so a person who left halfway continues where they were.
   */
  async createSession(
    userId: string,
    requestId: string,
  ): Promise<{ sessionId: string; url: string }> {
    const body = await this.call('POST', '/v3/session/', {
      workflow_id: this.workflowId,
      vendor_data: userId,
      callback: `${this.webUrl}/verification`,
      // Back to Pocket on whichever device finished the check.
      callback_method: 'both',
      language: 'es',
      metadata: { requestId },
    });
    const sessionId = body.session_id;
    const url = body.url ?? body.session_url;
    if (
      typeof sessionId !== 'string' ||
      typeof url !== 'string' ||
      !url.startsWith('https://')
    ) {
      this.logger.error('Didit created a session without an id or an https link');
      throw this.unavailable();
    }
    return { sessionId, url };
  }

  /** The session's outcome as Didit has it now. */
  async decision(sessionId: string): Promise<KycDecision> {
    const body = await this.call(
      'GET',
      `/v3/session/${encodeURIComponent(sessionId)}/decision/`,
    );
    return readDecision(body);
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers: {
          'x-api-key': this.apiKey,
          accept: 'application/json',
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Didit ${method} ${path} failed: ${(error as Error).message}`);
      throw this.unavailable();
    }
    if (!response.ok) {
      // The body may echo personal data: only the status goes to the log.
      this.logger.error(`Didit ${method} ${path} answered ${response.status}`);
      this.alertTeam(response.status);
      throw this.unavailable();
    }
    return (await response.json()) as Record<string, unknown>;
  }

  /**
   * Nobody can activate an account while Didit refuses Pocket (no credit
   * left, a revoked key): tell the team, at most every half hour.
   */
  private alertTeam(status: number): void {
    // A session Didit does not know is an answer, not an outage.
    if (status === 404) return;
    const now = Date.now();
    if (now - this.lastAlert < ALERT_EVERY_MS) return;
    this.lastAlert = now;
    securityEvent('kyc_unavailable', { status }, 'alert');
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'No pudimos conectar con el servicio de verificación de identidad. Intenta de nuevo en un minuto',
    );
  }
}

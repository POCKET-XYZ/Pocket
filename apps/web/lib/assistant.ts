import { API_URL, ApiError, NETWORK_ERROR, getToken } from './api';
import { readableMessages } from './validation-messages';

/** A milestone as the assistant suggests it, amount empty without a budget. */
export interface SuggestedMilestone {
  title: string;
  description: string;
  acceptanceCriteria: string;
  amount: number | null;
}

export interface SuggestedKpi {
  name: string;
  targetValue?: number;
  direction?: 'more_is_better' | 'less_is_better';
  unit?: string;
  /** The saved template it came from; null for a new KPI. */
  templateId: string | null;
}

/** A whole job draft, after the API's checks. */
export interface SuggestedJob {
  title: string | null;
  description: string | null;
  deliverables: string | null;
  milestones: SuggestedMilestone[];
  kpis: SuggestedKpi[];
  warnings: string[];
  budget: number | null;
}

export type TextKey = 'title' | 'description' | 'deliverables';

/** What the API streams, one per line. */
export type AssistantEvent =
  | { type: 'status'; stage: 'writing' | 'adjusting' }
  | { type: 'part'; key: TextKey; value: string }
  | {
      type: 'part';
      key: `milestone:${number}`;
      value: Omit<SuggestedMilestone, 'amount'>;
    }
  | { type: 'questions'; suggestionId: string; questions: string[] }
  | { type: 'part'; key: 'note'; value: string }
  | { type: 'done'; suggestionId: string; draft: SuggestedJob; remainingToday: number }
  | {
      type: 'report';
      suggestionId: string;
      report: SuggestedReport;
      remainingToday: number;
    }
  | { type: 'error'; message: string };

/** A KPI's result read from the expert's notes; empty when they do not give it. */
export interface SuggestedResult {
  kpiId: string;
  name: string;
  value: number | null;
  warning: string | null;
}

export interface SuggestedReport {
  note: string | null;
  kpis: SuggestedResult[];
}

export interface Quota {
  available: boolean;
  /** off: switched off for everyone, so nothing is shown. */
  reason?: 'off' | 'not_verified' | 'daily';
  message?: string;
  remainingToday: number;
  dailyLimit: number;
}

export interface JobDraftRequest {
  text: string;
  category?: string;
  followUp?: { questions: string[]; answers: string };
  jobId?: string;
}

/**
 * Ask for a job draft and hand each streamed event to `onEvent` as it
 * arrives. A request the API refuses (off, not verified, over a limit)
 * throws an ApiError with its message, before any event.
 */
export function streamJobDraft(
  body: JobDraftRequest,
  onEvent: (event: AssistantEvent) => void,
): Promise<void> {
  return streamAssistant('/assistant/job-draft', body, onEvent);
}

/** Ask for a delivery report from the expert's notes, streamed the same way. */
export function streamDeliveryReport(
  body: { milestoneId: string; notes: string },
  onEvent: (event: AssistantEvent) => void,
): Promise<void> {
  return streamAssistant('/assistant/delivery-report', body, onEvent);
}

async function streamAssistant(
  path: string,
  body: unknown,
  onEvent: (event: AssistantEvent) => void,
): Promise<void> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      reason?: string;
    };
    const message = Array.isArray(payload.message)
      ? readableMessages(payload.message)
      : payload.message;
    throw new ApiError(response.status, message ?? response.statusText, payload.reason);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new ApiError(0, NETWORK_ERROR);
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as AssistantEvent);
      newline = buffer.indexOf('\n');
    }
  }
}

/**
 * Every email Pocket sends, in one place. Each is short and plain, with one
 * button to the page where the user acts. Anything a user typed (titles,
 * reasons, feedback) is escaped before it goes into the HTML.
 */

export type NotificationEvent =
  | { type: 'verification_approved' }
  | { type: 'verification_rejected'; reason: string }
  | { type: 'offer_received'; contractId: string; jobTitle: string }
  | { type: 'terms_accepted'; contractId: string; jobTitle: string }
  | { type: 'escrow_funded'; contractId: string }
  | { type: 'milestone_delivered'; contractId: string; milestoneTitle: string }
  | {
      type: 'changes_requested';
      contractId: string;
      milestoneTitle: string;
      feedback: string;
    }
  | { type: 'milestone_paid'; contractId: string; milestoneTitle: string; amount: string }
  | { type: 'dispute_opened'; disputeId: string; milestoneTitle: string }
  | {
      type: 'dispute_resolved';
      disputeId: string;
      milestoneTitle: string;
      specialistAmount: string;
      startupAmount: string;
    };

export type NotificationType = NotificationEvent['type'];

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** What one email says, before the layout wraps it. */
interface Content {
  subject: string;
  /** Plain-text paragraphs. Escaped for the HTML version. */
  paragraphs: string[];
  button: { label: string; path: string };
}

function content(event: NotificationEvent): Content {
  switch (event.type) {
    case 'verification_approved':
      return {
        subject: 'Your Pocket account is verified',
        paragraphs: [
          'Good news: a manager approved your verification. You can now use the marketplace.',
        ],
        button: { label: 'Open Pocket', path: '/dashboard' },
      };
    case 'verification_rejected':
      return {
        subject: 'Your Pocket verification needs changes',
        paragraphs: [
          'A manager could not approve your verification yet. Their reason:',
          event.reason,
          'Fix the details and submit again.',
        ],
        button: { label: 'Update your verification', path: '/verification' },
      };
    case 'offer_received':
      return {
        subject: `New offer: ${event.jobTitle}`,
        paragraphs: [
          `A startup wants to hire you for "${event.jobTitle}". Review the milestones and accept or decline the terms.`,
        ],
        button: { label: 'Review the offer', path: `/contracts/${event.contractId}` },
      };
    case 'terms_accepted':
      return {
        subject: `Terms accepted: ${event.jobTitle}`,
        paragraphs: [
          `The specialist accepted your terms for "${event.jobTitle}". Fund the escrow so the work can start.`,
        ],
        button: { label: 'Fund the escrow', path: `/contracts/${event.contractId}` },
      };
    case 'escrow_funded':
      return {
        subject: 'The escrow is funded, you can start',
        paragraphs: [
          'The startup funded the escrow for your contract. The money is held safely: you can start working.',
        ],
        button: { label: 'Open the contract', path: `/contracts/${event.contractId}` },
      };
    case 'milestone_delivered':
      return {
        subject: `Milestone delivered: ${event.milestoneTitle}`,
        paragraphs: [
          `The specialist delivered "${event.milestoneTitle}". Review it and approve the payment or request changes.`,
        ],
        button: { label: 'Review the delivery', path: `/contracts/${event.contractId}` },
      };
    case 'changes_requested':
      return {
        subject: `Changes requested: ${event.milestoneTitle}`,
        paragraphs: [
          `The startup asked for changes to "${event.milestoneTitle}":`,
          event.feedback,
        ],
        button: { label: 'Open the contract', path: `/contracts/${event.contractId}` },
      };
    case 'milestone_paid':
      return {
        subject: `You were paid ${event.amount} USDC`,
        paragraphs: [
          `The startup approved "${event.milestoneTitle}" and ${event.amount} USDC was released to your wallet.`,
        ],
        button: { label: 'Open the contract', path: `/contracts/${event.contractId}` },
      };
    case 'dispute_opened':
      return {
        subject: `Dispute opened: ${event.milestoneTitle}`,
        paragraphs: [
          `The other party opened a dispute on "${event.milestoneTitle}". The milestone's funds stay in the escrow until a manager decides. Add your evidence.`,
        ],
        button: { label: 'Open the dispute', path: `/disputes/${event.disputeId}` },
      };
    case 'dispute_resolved':
      return {
        subject: `Dispute resolved: ${event.milestoneTitle}`,
        paragraphs: [
          `A manager resolved the dispute on "${event.milestoneTitle}".`,
          `The specialist receives ${event.specialistAmount} USDC and the startup receives ${event.startupAmount} USDC.`,
        ],
        button: { label: 'See the decision', path: `/disputes/${event.disputeId}` },
      };
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A subject is one line: whatever a user typed cannot break it. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 150);
}

/** Wrap an email's content in the shared layout, as HTML and as plain text. */
export function render(event: NotificationEvent, webUrl: string): RenderedEmail {
  const { subject, paragraphs, button } = content(event);
  const link = `${webUrl.replace(/\/+$/, '')}${button.path}`;
  const body = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(paragraph)}</p>`,
    )
    .join('');
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
<p style="margin:0 0 24px;font-weight:bold;font-size:18px">Pocket</p>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px">${escapeHtml(button.label)}</a></p>
<p style="margin:0;font-size:12px;color:#78716c">You get this email because you have a Pocket account.</p>
</div>
</body></html>`;
  const text = [...paragraphs, `${button.label}: ${link}`].join('\n\n');
  return { subject: oneLine(subject), html, text };
}

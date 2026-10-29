/**
 * Every email Pocket sends, in one place. Each is short and plain, with one
 * button to the page where the user acts. Anything a user typed (titles,
 * reasons, feedback) is escaped before it goes into the HTML.
 */

export type NotificationEvent =
  | { type: 'verification_approved' }
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
        subject: 'Tu cuenta de Pocket está lista',
        paragraphs: [
          'Ya completaste tus datos. Puedes usar el marketplace y te avisaremos a este correo de cada novedad.',
        ],
        button: { label: 'Abrir Pocket', path: '/dashboard' },
      };
    case 'offer_received':
      return {
        subject: `Nueva oferta: ${event.jobTitle}`,
        paragraphs: [
          `Una startup quiere contratarte para "${event.jobTitle}". Revisa los hitos y acepta o rechaza los términos.`,
        ],
        button: { label: 'Revisar la oferta', path: `/contracts/${event.contractId}` },
      };
    case 'terms_accepted':
      return {
        subject: `Términos aceptados: ${event.jobTitle}`,
        paragraphs: [
          `El experto aceptó tus términos para "${event.jobTitle}". Deposita el pago en el contrato para que empiece el trabajo.`,
        ],
        button: { label: 'Depositar el pago', path: `/contracts/${event.contractId}` },
      };
    case 'escrow_funded':
      return {
        subject: 'El pago está depositado: ya puedes empezar',
        paragraphs: [
          'La startup depositó el pago en tu contrato. El dinero queda guardado de forma segura: ya puedes empezar a trabajar.',
        ],
        button: { label: 'Ver el contrato', path: `/contracts/${event.contractId}` },
      };
    case 'milestone_delivered':
      return {
        subject: `Hito entregado: ${event.milestoneTitle}`,
        paragraphs: [
          `El experto entregó "${event.milestoneTitle}". Revísalo y aprueba el pago o pide cambios.`,
        ],
        button: { label: 'Revisar la entrega', path: `/contracts/${event.contractId}` },
      };
    case 'changes_requested':
      return {
        subject: `Cambios pedidos: ${event.milestoneTitle}`,
        paragraphs: [
          `La startup pidió cambios en "${event.milestoneTitle}":`,
          event.feedback,
        ],
        button: { label: 'Ver el contrato', path: `/contracts/${event.contractId}` },
      };
    case 'milestone_paid':
      return {
        subject: `Te pagaron ${event.amount} USDC`,
        paragraphs: [
          `La startup aprobó "${event.milestoneTitle}" y se liberó el pago de ${event.amount} USDC a tu wallet.`,
        ],
        button: { label: 'Ver el contrato', path: `/contracts/${event.contractId}` },
      };
    case 'dispute_opened':
      return {
        subject: `Disputa abierta: ${event.milestoneTitle}`,
        paragraphs: [
          `La otra parte abrió una disputa sobre "${event.milestoneTitle}". Los fondos del hito se quedan en el contrato hasta que un manager decida. Agrega tu evidencia.`,
        ],
        button: { label: 'Ver la disputa', path: `/disputes/${event.disputeId}` },
      };
    case 'dispute_resolved':
      return {
        subject: `Disputa resuelta: ${event.milestoneTitle}`,
        paragraphs: [
          `Un manager resolvió la disputa sobre "${event.milestoneTitle}".`,
          `El experto recibe ${event.specialistAmount} USDC y la startup recibe ${event.startupAmount} USDC.`,
        ],
        button: { label: 'Ver la decisión', path: `/disputes/${event.disputeId}` },
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
<html lang="es"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
<p style="margin:0 0 24px;font-weight:bold;font-size:18px">Pocket</p>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px">${escapeHtml(button.label)}</a></p>
<p style="margin:0;font-size:12px;color:#78716c">Recibes este correo porque tienes una cuenta en Pocket.</p>
</div>
</body></html>`;
  const text = [...paragraphs, `${button.label}: ${link}`].join('\n\n');
  return { subject: oneLine(subject), html, text };
}

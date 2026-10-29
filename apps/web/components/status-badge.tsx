import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-celeste-light text-navy',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-yellow/40 text-navy',
  danger: 'bg-red-100 text-red-800',
};

/**
 * Every state the API returns, with the words and color the UI shows for it.
 * Some states are shared by masculine nouns (trabajo, contrato, hito) and
 * feminine ones (verificación, postulación, disputa); `feminine` is their
 * label for the latter.
 */
const STATUSES: Record<string, { label: string; feminine?: string; tone: Tone }> = {
  // Verification
  not_submitted: { label: 'Sin enviar', tone: 'neutral' },
  pending: { label: 'Pendiente', tone: 'warning' },
  approved: { label: 'Aprobado', feminine: 'Aprobada', tone: 'success' },
  rejected: { label: 'Rechazado', feminine: 'Rechazada', tone: 'danger' },
  // Jobs
  open: { label: 'Abierto', feminine: 'Abierta', tone: 'info' },
  in_progress: { label: 'En curso', tone: 'warning' },
  completed: { label: 'Completado', feminine: 'Completada', tone: 'success' },
  closed: { label: 'Cerrado', feminine: 'Cerrada', tone: 'neutral' },
  // Applications
  submitted: { label: 'Enviada', tone: 'info' },
  accepted: { label: 'Aceptada', tone: 'success' },
  withdrawn: { label: 'Retirada', tone: 'neutral' },
  // Contracts
  awaiting_specialist: { label: 'Esperando al experto', tone: 'warning' },
  awaiting_funding: { label: 'Esperando el depósito', tone: 'warning' },
  active: { label: 'Activo', tone: 'info' },
  cancelled: { label: 'Cancelado', feminine: 'Cancelada', tone: 'neutral' },
  // Milestones
  delivered: { label: 'Entregado', tone: 'info' },
  changes_requested: { label: 'Cambios pedidos', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
  disputed: { label: 'En disputa', tone: 'danger' },
  resolved: { label: 'Resuelto', feminine: 'Resuelta', tone: 'neutral' },
};

export function statusLabel(status: string, feminine = false): string {
  const known = STATUSES[status];
  return (feminine ? known?.feminine : undefined) ?? known?.label ?? status;
}

export function StatusBadge({
  status,
  feminine = false,
  className,
}: {
  status: string;
  /** The status of a verificación, postulación or disputa. */
  feminine?: boolean;
  className?: string;
}) {
  const known = STATUSES[status] ?? { label: status, tone: 'neutral' as const };
  return (
    <Badge
      variant="secondary"
      className={cn('border-0 font-medium', TONES[known.tone], className)}
    >
      {statusLabel(status, feminine)}
    </Badge>
  );
}

import { ShieldCheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Says that a specialist passed Pocket's identity check. A specialist without
 * it can apply, and passes the check to accept a contract.
 */
export function IdentitySeal({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800',
        className,
      )}
      title="Pocket verificó su identidad con su documento y una selfie"
    >
      <ShieldCheckIcon className="size-3.5" aria-hidden />
      Identidad verificada
    </span>
  );
}

/**
 * An account that registered on Pocket's test network and has not activated
 * its account here yet: its profile shows, but it cannot be hired or hire.
 */
export function WaitingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
        className,
      )}
      title="Se registró en la red de pruebas de Pocket y todavía no activa su cuenta aquí."
    >
      Por activar
    </span>
  );
}

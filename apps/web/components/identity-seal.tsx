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

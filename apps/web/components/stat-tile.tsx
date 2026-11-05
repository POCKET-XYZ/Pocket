import { TriangleAlertIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** One figure in a grid of them, optionally linking to the page behind it. */
export function StatTile({
  label,
  value,
  unit,
  hint,
  attention = false,
  href,
  icon: Icon,
  meter,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
  /** Something to look at: shown with an icon and words, not color alone. */
  attention?: boolean;
  href?: string;
  icon?: LucideIcon;
  /** A share from 0 to 1, drawn under the value. */
  meter?: number | null;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg text-navy',
              attention ? 'bg-yellow' : 'bg-celeste-light/70',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-heading text-2xl leading-tight font-semibold text-navy wrap-anywhere">
        {value}
        {unit ? (
          <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </p>
      {meter !== undefined && meter !== null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-celeste-light/60" aria-hidden>
          <div
            className="h-full rounded-full bg-navy"
            style={{ width: `${Math.round(Math.min(Math.max(meter, 0), 1) * 100)}%` }}
          />
        </div>
      ) : null}
      {attention ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-navy">
          <TriangleAlertIcon className="size-3.5 shrink-0 text-destructive" aria-hidden />
          Requiere atención
        </p>
      ) : null}
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{capitalize(hint)}</p>
      ) : null}
    </>
  );
  const className = cn(
    'min-w-0 rounded-2xl border bg-card p-4',
    // With an icon the tile is on a panel, where what needs doing should stand out.
    attention && Icon ? 'border-yellow bg-yellow/10' : 'border-border',
  );
  return href ? (
    <Link href={href} className={cn(className, 'transition hover:border-celeste')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

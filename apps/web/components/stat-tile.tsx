import { TriangleAlertIcon } from 'lucide-react';
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
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
  /** Something to look at: shown with an icon and words, not color alone. */
  attention?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl leading-tight font-semibold text-navy wrap-anywhere">
        {value}
        {unit ? (
          <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </p>
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
  const className = 'min-w-0 rounded-2xl border border-border bg-card p-4';
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

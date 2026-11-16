import { Loader2Icon, LockIcon, RotateCwIcon } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api';

/** Title row at the top of every page, with optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-navy md:text-4xl">{title}</h1>
        {/* A div, not a paragraph: pages pass whole elements in here, and an
            avatar or a badge inside a <p> is invalid HTML. */}
        {description ? (
          <div className="mt-2 max-w-2xl text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Loading({ label = 'Cargando' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" />
      {label}
    </div>
  );
}

/**
 * In place of a page that does not exist or is not the visitor's: the same
 * words either way, so a link says nothing about what is there or whose it is.
 */
export function NotAvailable() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-celeste-light text-navy">
        <LockIcon className="size-5" />
      </span>
      <h1 className="mt-4 font-heading text-2xl font-bold text-navy">
        No puedes ver esta página
      </h1>
      <p className="mt-2 text-muted-foreground">
        No existe o no es de la cuenta con la que entraste. Si te pasaron el enlace,
        revisa que estés en la cuenta correcta.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Ir al inicio</Link>
      </Button>
    </div>
  );
}

/** A page the API said is missing or not the user's: shown the same way. */
export function isNotAvailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

/**
 * An error in place of what a page could not load. With `onRetry`, a button
 * asks for it again, for when the connection or the API comes back. Something
 * missing or not the user's shows NotAvailable instead of the API's words.
 */
export function ErrorAlert({
  error,
  title = 'Algo salió mal',
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  if (isNotAvailable(error)) return <NotAvailable />;
  // Asking again only helps when the connection or the server failed: a
  // missing contract or a refused page answers the same every time.
  const retryable =
    !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="whitespace-pre-line">
        {errorMessage(error)}
      </AlertDescription>
      {onRetry && retryable ? (
        <div className="mt-2">
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCwIcon />
            Reintentar
          </Button>
        </div>
      ) : null}
    </Alert>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="font-heading text-lg font-bold text-navy">{title}</p>
      {children ? (
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
      ) : null}
    </div>
  );
}

/** A labelled value, for detail pages. */
export function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

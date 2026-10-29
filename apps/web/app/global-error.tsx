'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import './globals.css';

/** Shown when a page crashes: the error is reported and the person can retry. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Algo salió mal</h1>
        <p className="text-muted-foreground max-w-md">
          Ya nos avisaron del error. Inténtalo de nuevo y, si sigue pasando, vuelve en
          unos minutos.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}

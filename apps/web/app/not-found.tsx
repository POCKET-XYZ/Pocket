import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Página no encontrada' };

/**
 * Any address Pocket does not have, and any page that calls notFound(). It
 * renders inside the layout, so the menu stays and the person can move on.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <p aria-hidden className="font-heading text-6xl font-bold text-navy/25">
        404
      </p>
      <h1 className="mt-4 text-3xl font-bold text-navy">No encontramos esa página</h1>
      <p className="mt-3 text-muted-foreground">
        Puede que el enlace esté mal escrito o que la página ya no exista.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild size="lg">
          <Link href="/jobs">Ver trabajos</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">Ir al inicio</Link>
        </Button>
      </div>
    </div>
  );
}

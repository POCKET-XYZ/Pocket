'use client';

import type { User, UserRole } from '@pocket/shared';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, Loading } from '@/components/page';
import { Button } from '@/components/ui/button';
import { homeFor } from '@/lib/home';

/** How each role reads inside a sentence. */
const ROLE_NAMES: Record<UserRole, string> = {
  startup: 'startup',
  specialist: 'experto',
  manager: 'manager',
};

/**
 * Renders its children only for a signed-in user with one of the given roles,
 * and, when `verified` is set, only once they completed their account details.
 * Otherwise it says what is missing and links to the fix.
 */
export function RequireAuth({
  roles,
  verified = false,
  children,
}: {
  roles?: UserRole[];
  verified?: boolean;
  children: (user: User) => React.ReactNode;
}) {
  const { status, user, refreshUser } = useAuth();

  if (status === 'loading') return <Loading />;

  // Signed in, but Pocket cannot be reached: not the same as signed out.
  if (status === 'unreachable') {
    return (
      <EmptyState title="No podemos conectar con Pocket en este momento">
        <p>Tu sesión está bien. Revisa tu conexión e inténtalo de nuevo en un momento.</p>
        <Button className="mt-4" onClick={() => void refreshUser()}>
          Reintentar
        </Button>
      </EmptyState>
    );
  }

  if (!user) {
    return (
      <EmptyState title="Inicia sesión para continuar">
        <Button asChild className="mt-4">
          <Link href="/login">Entrar</Link>
        </Button>
      </EmptyState>
    );
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <EmptyState title="Esta página no es para tu cuenta">
        <p>
          Solo es para cuentas de {roles.map((role) => ROLE_NAMES[role]).join(' o ')}.
        </p>
        <Button asChild className="mt-4">
          <Link href={homeFor(user)}>Ir a tu inicio</Link>
        </Button>
      </EmptyState>
    );
  }

  if (verified && user.role !== 'manager' && user.verificationStatus !== 'approved') {
    return (
      <EmptyState title="Tu cuenta todavía no está activa">
        <p>Completa los datos de tu cuenta. Es un formulario corto, sin documentos.</p>
        <Button asChild className="mt-4">
          <Link href="/verification">Completar mis datos</Link>
        </Button>
      </EmptyState>
    );
  }

  return <>{children(user)}</>;
}

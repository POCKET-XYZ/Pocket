'use client';

import type { User, UserRole } from '@pocket/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, Loading } from '@/components/page';
import { Button } from '@/components/ui/button';
import { homeFor } from '@/lib/home';

const VERIFICATION_HINTS: Record<string, string> = {
  not_submitted:
    'Envía tus datos para la verificación. Un manager de Pocket revisa cada cuenta.',
  pending:
    'Tu verificación está en revisión. Podrás usar el marketplace cuando un manager la apruebe.',
  rejected:
    'Tu verificación fue rechazada. Revisa la nota del manager, corrige tus datos y vuelve a enviarlos.',
};

/** How each role reads inside a sentence. */
const ROLE_NAMES: Record<UserRole, string> = {
  startup: 'startup',
  specialist: 'experto',
  manager: 'manager',
};

/**
 * Renders its children only for a signed-in user with one of the given roles,
 * and, when `verified` is set, only once a manager approved them. Otherwise it
 * says what is missing and links to the fix.
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
      <EmptyState title="Tu cuenta todavía no está verificada">
        <p>{VERIFICATION_HINTS[user.verificationStatus]}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/verification">Ir a la verificación</Link>
          </Button>
          {user.verificationStatus === 'pending' ? <CheckAgainButton /> : null}
        </div>
      </EmptyState>
    );
  }

  return <>{children(user)}</>;
}

/** Asks the API again, for the moment right after a manager approves. */
function CheckAgainButton() {
  const { refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={checking}
      onClick={() => {
        setChecking(true);
        void refreshUser().finally(() => setChecking(false));
      }}
    >
      {checking ? 'Revisando...' : 'Revisar de nuevo'}
    </Button>
  );
}

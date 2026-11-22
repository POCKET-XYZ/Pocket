'use client';

import type { OwnStartup, User, UserRole } from '@pocket/shared';
import { useQueryClient } from '@tanstack/react-query';
import { BriefcaseIcon, CheckIcon, PlusIcon, UserIcon, UserPlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api';

type MarketRole = 'startup' | 'specialist';

/** Every role the account has; older answers only carry its one role. */
export function rolesOf(user: User): UserRole[] {
  return user.roles?.length ? user.roles : [user.role];
}

function startupsOf(user: User): OwnStartup[] {
  return user.startups ?? [];
}

/** Whether the account can switch to something else: a second role or startup. */
export function hasSeveralModes(user: User): boolean {
  return rolesOf(user).length > 1 || startupsOf(user).length > 1;
}

/** The name of what the account acts as now, for the account menu. */
export function activeModeName(user: User): string | null {
  if (user.role !== 'startup') return null;
  return startupsOf(user).find((s) => s.id === user.activeStartupId)?.companyName ?? null;
}

/**
 * Adding a role, switching role, switching startup or adding one. After a
 * switch everything on screen belongs to the other side, so the cached data
 * goes and the person lands on the home page; something new starts with its
 * profile.
 */
function useAccountSwitch() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function run(call: () => Promise<unknown>, done: string, next: string) {
    setBusy(true);
    try {
      await call();
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      await refreshUser();
      toast.success(done);
      router.push(next);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toRole(user: User, role: MarketRole) {
    if (rolesOf(user).includes(role)) {
      if (user.role === role) return;
      await run(
        () => api('/users/me/role', { method: 'PUT', body: { role } }),
        role === 'specialist' ? 'Ahora estás como experto' : 'Ahora estás como startup',
        '/',
      );
      return;
    }
    const ok = await confirm({
      title:
        role === 'specialist'
          ? '¿Quieres trabajar como experto también?'
          : '¿Quieres publicar trabajos también?',
      description:
        role === 'specialist'
          ? 'Tu cuenta suma el rol de experto: podrás postularte a trabajos de otras startups con tu misma billetera y tu misma verificación. Cambias entre tus startups y tu perfil de experto desde el menú de tu cuenta. Primero completa tu perfil de experto.'
          : 'Tu cuenta suma el rol de startup: podrás publicar trabajos y contratar expertos con tu misma billetera. Cambias entre tu perfil de experto y tus startups desde el menú de tu cuenta. Primero completa el perfil de tu startup.',
      confirmText: 'Sí, activarlo',
    });
    if (!ok) return;
    await run(
      () => api('/users/me/roles', { method: 'POST', body: { role } }),
      role === 'specialist' ? 'Ahora también eres experto' : 'Ahora también eres startup',
      '/profile',
    );
  }

  async function toStartup(user: User, startup: OwnStartup) {
    if (user.role === 'startup' && user.activeStartupId === startup.id) return;
    await run(
      () => api('/users/me/startup', { method: 'PUT', body: { startupId: startup.id } }),
      `Ahora estás como ${startup.companyName}`,
      '/',
    );
  }

  /** A new startup starts with its profile, as the startup role. */
  async function addStartup(user: User) {
    if (user.role !== 'startup') {
      await run(
        () => api('/users/me/role', { method: 'PUT', body: { role: 'startup' } }),
        'Completa el perfil de tu nueva startup',
        '/profile?nueva=1',
      );
      return;
    }
    router.push('/profile?nueva=1');
  }

  return { toRole, toStartup, addStartup, busy };
}

/**
 * The account menu's part for switching: each startup the account owns, its
 * specialist side, and the way to add either.
 */
export function AccountSwitchItems({ user }: { user: User }) {
  const { toRole, toStartup, addStartup, busy } = useAccountSwitch();
  if (user.role === 'manager') return null;
  const roles = rolesOf(user);
  const startups = startupsOf(user);
  const isStartup = roles.includes('startup');
  const isSpecialist = roles.includes('specialist');

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Usar Pocket como
      </DropdownMenuLabel>
      {startups.map((startup) => {
        const current = user.role === 'startup' && user.activeStartupId === startup.id;
        return (
          <DropdownMenuItem
            key={startup.id}
            disabled={busy}
            onSelect={() => void toStartup(user, startup)}
          >
            <BriefcaseIcon />
            <span className="min-w-0 flex-1 truncate">{startup.companyName}</span>
            {current ? <CheckIcon aria-label="Activa" /> : null}
          </DropdownMenuItem>
        );
      })}
      {isSpecialist ? (
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => void toRole(user, 'specialist')}
        >
          <UserIcon />
          <span className="flex-1">Experto</span>
          {user.role === 'specialist' ? <CheckIcon aria-label="Activo" /> : null}
        </DropdownMenuItem>
      ) : null}
      {isStartup ? (
        <DropdownMenuItem disabled={busy} onSelect={() => void addStartup(user)}>
          <PlusIcon /> Agregar otra startup
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem disabled={busy} onSelect={() => void toRole(user, 'startup')}>
          <UserPlusIcon /> Quiero publicar trabajos también
        </DropdownMenuItem>
      )}
      {isSpecialist ? null : (
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => void toRole(user, 'specialist')}
        >
          <UserPlusIcon /> Quiero trabajar como experto también
        </DropdownMenuItem>
      )}
    </>
  );
}

/** The same, explained, on the account page. */
export function RolesCard({ user }: { user: User }) {
  const { toRole, addStartup, busy } = useAccountSwitch();
  if (user.role === 'manager') return null;
  const roles = rolesOf(user);
  const startups = startupsOf(user);
  const both = roles.includes('startup') && roles.includes('specialist');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Startups y experto en una cuenta</CardTitle>
        <CardDescription>
          {both || startups.length > 1
            ? 'Tu cuenta tiene más de un perfil. Lo que ves y lo que haces es del que está activo: lo cambias desde el menú de tu cuenta, arriba a la derecha. En público cada perfil se ve por separado.'
            : 'Con la misma billetera y la misma verificación puedes tener varias startups, y también trabajar como experto para otras. En público cada perfil se ve por separado.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {roles.includes('startup') ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void addStartup(user)}
          >
            <PlusIcon /> Agregar otra startup
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void toRole(user, 'startup')}
          >
            Quiero publicar trabajos también
          </Button>
        )}
        {roles.includes('specialist') ? null : (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void toRole(user, 'specialist')}
          >
            Quiero trabajar como experto también
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

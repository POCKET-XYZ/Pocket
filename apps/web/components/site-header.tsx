'use client';

import type { UserRole } from '@pocket/shared';
import { ChevronDownIcon, MenuIcon, WalletIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { shortAddress } from '@/lib/format';
import { cn } from '@/lib/utils';

const PUBLIC_LINKS = [
  { href: '/jobs', label: 'Trabajos' },
  { href: '/specialists', label: 'Expertos' },
  { href: '/startups', label: 'Startups' },
];

const ROLE_LINKS: Record<UserRole, { href: string; label: string }[]> = {
  startup: [
    { href: '/dashboard', label: 'Mis publicaciones' },
    { href: '/contracts', label: 'Contratos' },
    { href: '/profile', label: 'Perfil' },
  ],
  specialist: [
    { href: '/applications', label: 'Mis postulaciones' },
    { href: '/contracts', label: 'Contratos' },
    { href: '/profile', label: 'Perfil' },
  ],
  manager: [
    { href: '/manager/disputes', label: 'Disputas' },
    { href: '/manager/metrics', label: 'Métricas' },
  ],
};

/** How each role reads in the account menu. */
const ROLE_LABELS: Record<UserRole, string> = {
  startup: 'Startup',
  specialist: 'Experto',
  manager: 'Manager',
};

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function SiteHeader() {
  const { status, user, signOut } = useAuth();
  const pathname = usePathname();
  const links = user
    ? [{ href: '/', label: 'Inicio' }, ...PUBLIC_LINKS, ...ROLE_LINKS[user.role]]
    : PUBLIC_LINKS;

  // The sign-in page stands alone: the menu and its Sign in button next to
  // the sign-in options confused people.
  if (pathname === '/login') return null;

  return (
    <header className="sticky top-0 z-40 bg-navy text-off-white shadow-sm print:hidden">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 md:px-6">
        <Link href="/" aria-label="Pocket, inicio" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-white.svg"
            alt="Pocket"
            width={116}
            height={28}
            className="h-7 w-auto"
          />
        </Link>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm text-off-white/75 transition hover:bg-white/10 hover:text-off-white',
                isCurrent(pathname, link.href) && 'bg-white/10 text-off-white',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Short of room for all the links, the nav collapses into a menu of its own. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-off-white hover:bg-white/10 hover:text-off-white lg:hidden"
                aria-label="Menú"
              >
                <MenuIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 lg:hidden">
              {links.map((link) => (
                <DropdownMenuItem key={link.href} asChild>
                  <Link href={link.href}>{link.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {status === 'signed-in' && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="gap-2">
                  <WalletIcon />
                  {shortAddress(user.stellarAddress)}
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="flex items-center justify-between gap-2">
                  <span>{ROLE_LABELS[user.role]}</span>
                  {user.role !== 'manager' ? (
                    <StatusBadge feminine status={user.verificationStatus} />
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.role !== 'manager' ? (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/profile">Mi perfil</Link>
                    </DropdownMenuItem>
                    {/* Only while there is something to do there: the badge above says the rest. */}
                    {user.verificationStatus !== 'approved' ? (
                      <DropdownMenuItem asChild>
                        <Link href="/verification">Activar mi cuenta</Link>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem asChild>
                      <Link href="/wallet">Wallet y USDC</Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link href="/account">Tu cuenta y tus datos</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>Cerrar sesión</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : status === 'signed-out' ? (
            <Button asChild className="bg-mandarina text-navy hover:bg-mandarina/85">
              <Link href="/login">Entrar</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

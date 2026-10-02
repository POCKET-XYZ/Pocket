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
  { href: '/jobs', label: 'Jobs' },
  { href: '/specialists', label: 'Specialists' },
  { href: '/startups', label: 'Startups' },
];

const ROLE_LINKS: Record<UserRole, { href: string; label: string }[]> = {
  startup: [
    { href: '/dashboard', label: 'My jobs' },
    { href: '/contracts', label: 'Contracts' },
    { href: '/profile', label: 'Profile' },
  ],
  specialist: [
    { href: '/applications', label: 'My applications' },
    { href: '/contracts', label: 'Contracts' },
    { href: '/profile', label: 'Profile' },
  ],
  manager: [
    { href: '/manager/verifications', label: 'Verifications' },
    { href: '/manager/disputes', label: 'Disputes' },
    { href: '/manager/metrics', label: 'Metrics' },
  ],
};

export function SiteHeader() {
  const { status, user, signOut } = useAuth();
  const pathname = usePathname();
  const links = [...PUBLIC_LINKS, ...(user ? ROLE_LINKS[user.role] : [])];

  // The sign-in page stands alone: the menu and its Sign in button next to
  // the sign-in options confused people.
  if (pathname === '/login') return null;

  return (
    <header className="sticky top-0 z-40 bg-navy text-off-white shadow-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 md:px-6">
        <Link
          href="/"
          className="font-heading text-2xl font-bold tracking-tight text-off-white"
        >
          Pocket<span className="text-yellow">.</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm text-off-white/75 transition hover:bg-white/10 hover:text-off-white',
                pathname.startsWith(link.href) && 'bg-white/10 text-off-white',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* On a phone the nav collapses into a menu of its own, for everyone. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-off-white hover:bg-white/10 hover:text-off-white md:hidden"
                aria-label="Menu"
              >
                <MenuIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 md:hidden">
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
                  <span className="capitalize">{user.role}</span>
                  {user.role !== 'manager' ? (
                    <StatusBadge status={user.verificationStatus} />
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.role !== 'manager' ? (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/profile">My profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/verification">Verification</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/wallet">Wallet and USDC</Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : status === 'signed-out' ? (
            <Button asChild className="bg-yellow text-navy hover:bg-yellow/85">
              <Link href="/login">Sign in</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

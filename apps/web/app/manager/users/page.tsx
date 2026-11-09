'use client';

import type { AdminUserRow, UserRole } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  ChainLink,
  FilterTabs,
  SearchBox,
  matches,
  shortDay,
} from '@/components/manager/admin-ui';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { explorerAccount } from '@/lib/format';

export default function AdminUsersPage() {
  return <RequireAuth roles={['manager']}>{() => <Users />}</RequireAuth>;
}

type Filter = 'all' | 'startup' | 'specialist' | 'pending' | 'manager' | 'deleted';

const ROLE_LABELS: Record<UserRole, string> = {
  startup: 'Startup',
  specialist: 'Experto',
  manager: 'Manager',
};

const FILTERS: { value: Filter; label: string; keep: (row: AdminUserRow) => boolean }[] =
  [
    { value: 'all', label: 'Todos', keep: (row) => !row.deletedAt },
    {
      value: 'startup',
      label: 'Startups',
      keep: (row) => !row.deletedAt && row.role === 'startup',
    },
    {
      value: 'specialist',
      label: 'Expertos',
      keep: (row) => !row.deletedAt && row.role === 'specialist',
    },
    {
      value: 'pending',
      label: 'Sin verificar',
      keep: (row) =>
        !row.deletedAt && row.role !== 'manager' && row.verificationStatus !== 'approved',
    },
    {
      value: 'manager',
      label: 'Managers',
      keep: (row) => !row.deletedAt && row.role === 'manager',
    },
    { value: 'deleted', label: 'Eliminadas', keep: (row) => Boolean(row.deletedAt) },
  ];

/** How someone signed in, in words: their own wallet, or Pollar with Google or email. */
function walletText(row: AdminUserRow): string {
  const provider = row.walletProvider
    ? row.walletProvider.charAt(0).toUpperCase() + row.walletProvider.slice(1)
    : null;
  if (row.walletCustody === 'pollar') return provider ? `Pollar (${provider})` : 'Pollar';
  return provider ?? 'Wallet propia';
}

function Users() {
  const users = useQuery({
    queryKey: ['manager', 'users'],
    queryFn: () => api<AdminUserRow[]>('/manager/users'),
  });
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const rows = users.data ?? [];
  const keep = FILTERS.find((f) => f.value === filter)?.keep ?? (() => true);
  const shown = rows.filter(
    (row) =>
      keep(row) && matches([row.name, row.email, row.stellarAddress, row.id], query),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Cada cuenta de Pocket: quién es, cómo entra, si ya pasó la verificación y qué ha hecho."
      />
      {users.error ? (
        <ErrorAlert error={users.error} onRetry={() => users.refetch()} />
      ) : null}
      {!users.data && !users.error ? <Loading /> : null}
      {users.data ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <FilterTabs
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((f) => ({
                value: f.value,
                label: f.label,
                count: rows.filter(f.keep).length,
              }))}
            />
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Buscar por nombre, correo o wallet"
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState title="Ninguna cuenta aquí">
              Prueba con otro filtro u otra búsqueda.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Verificación</TableHead>
                  <TableHead className="hidden md:table-cell">Entra con</TableHead>
                  <TableHead className="hidden lg:table-cell">Wallet</TableHead>
                  <TableHead className="hidden sm:table-cell">Actividad</TableHead>
                  <TableHead className="hidden md:table-cell">Desde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-normal">
                      <ProfileLink row={row} />
                      <span className="block text-xs text-muted-foreground">
                        {ROLE_LABELS[row.role]}
                        {row.email ? ` · ${row.email}` : ''}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.role === 'manager' ? (
                        <span className="text-xs text-muted-foreground">
                          Equipo de Pocket
                        </span>
                      ) : (
                        <>
                          <StatusBadge status={row.verificationStatus} feminine />
                          {row.kycStatus && row.verificationStatus !== 'approved' ? (
                            <span className="block pt-1 text-xs text-muted-foreground">
                              Didit: {row.kycStatus}
                            </span>
                          ) : null}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {walletText(row)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <ChainLink
                        href={explorerAccount(row.stellarAddress)}
                        address={row.stellarAddress}
                      />
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {activity(row)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {shortDay(row.deletedAt ?? row.createdAt)}
                      {row.deletedAt ? (
                        <span className="block text-xs text-muted-foreground">
                          eliminada
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      ) : null}
    </div>
  );
}

function ProfileLink({ row }: { row: AdminUserRow }) {
  const name = row.name ?? 'Sin perfil todavía';
  const href =
    row.deletedAt || row.role === 'manager'
      ? null
      : row.role === 'startup'
        ? `/startups/${row.id}`
        : `/specialists/${row.id}`;
  return href && row.name ? (
    <Link
      href={href}
      className="font-medium text-navy underline-offset-2 hover:underline"
    >
      {name}
    </Link>
  ) : (
    <span className="font-medium text-navy">{name}</span>
  );
}

function activity(row: AdminUserRow): string {
  const parts =
    row.role === 'startup'
      ? [plural(row.counts.jobs, 'trabajo', 'trabajos')]
      : row.role === 'specialist'
        ? [plural(row.counts.applications, 'postulación', 'postulaciones')]
        : [];
  if (row.role !== 'manager')
    parts.push(plural(row.counts.contracts, 'contrato', 'contratos'));
  return parts.join(' · ') || '-';
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

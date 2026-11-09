'use client';

import type { AdminJobRow } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  FilterTabs,
  SearchBox,
  matches,
  short,
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
import { CATEGORY_LABELS } from '@/lib/format';

export default function AdminJobsPage() {
  return <RequireAuth roles={['manager']}>{() => <Jobs />}</RequireAuth>;
}

type Filter = 'all' | 'open' | 'in_progress' | 'completed' | 'closed';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'open', label: 'Abiertos' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'completed', label: 'Completados' },
  { value: 'closed', label: 'Cerrados' },
];

function Jobs() {
  const jobs = useQuery({
    queryKey: ['manager', 'jobs'],
    queryFn: () => api<AdminJobRow[]>('/manager/jobs'),
  });
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const rows = jobs.data ?? [];
  const shown = rows.filter(
    (row) =>
      (filter === 'all' || row.status === filter) &&
      matches([row.title, row.startup.name, CATEGORY_LABELS[row.category]], query),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publicaciones"
        description="Cada trabajo publicado: quién lo publicó, cuántos se postularon y en qué quedó."
      />
      {jobs.error ? <ErrorAlert error={jobs.error} /> : null}
      {!jobs.data && !jobs.error ? <Loading /> : null}
      {jobs.data ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <FilterTabs
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((f) => ({
                value: f.value,
                label: f.label,
                count:
                  f.value === 'all'
                    ? rows.length
                    : rows.filter((r) => r.status === f.value).length,
              }))}
            />
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Buscar por trabajo o startup"
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState title="Ningún trabajo aquí">
              Prueba con otro filtro u otra búsqueda.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trabajo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Presupuesto
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Postulaciones</TableHead>
                  <TableHead className="hidden md:table-cell">Contrato</TableHead>
                  <TableHead className="hidden lg:table-cell">Publicado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-normal">
                      <Link
                        href={`/jobs/${row.id}`}
                        className="font-medium text-navy underline-offset-2 hover:underline"
                      >
                        {row.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {row.startup.name ?? 'Startup sin nombre'} ·{' '}
                        {CATEGORY_LABELS[row.category]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {short(row.budget)} USDC
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {row.applications.total === 0
                        ? 'Ninguna'
                        : `${row.applications.total}${
                            row.applications.waiting > 0
                              ? ` (${row.applications.waiting} sin responder)`
                              : ''
                          }`}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {row.contract ? (
                        <Link
                          href={`/manager/contracts/${row.contract.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          <StatusBadge status={row.contract.status} />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Sin contrato
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {shortDay(row.createdAt)}
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

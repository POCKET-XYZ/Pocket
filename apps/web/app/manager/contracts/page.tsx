'use client';

import type { AdminContractRow, ContractStatus } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  FilterTabs,
  FlagBadge,
  SearchBox,
  matches,
  short,
  shortDay,
} from '@/components/manager/admin-ui';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { CATEGORY_LABELS } from '@/lib/format';

export default function AdminContractsPage() {
  return <RequireAuth roles={['manager']}>{() => <Contracts />}</RequireAuth>;
}

type Filter = 'attention' | 'all' | 'active' | 'waiting' | 'completed' | 'cancelled';

const WAITING: ContractStatus[] = ['awaiting_specialist', 'awaiting_funding'];

const FILTERS: {
  value: Filter;
  label: string;
  keep: (row: AdminContractRow) => boolean;
}[] = [
  {
    value: 'attention',
    label: 'Requieren atención',
    keep: (row) => row.flags.length > 0,
  },
  { value: 'active', label: 'En curso', keep: (row) => row.status === 'active' },
  { value: 'waiting', label: 'Por empezar', keep: (row) => WAITING.includes(row.status) },
  { value: 'completed', label: 'Completados', keep: (row) => row.status === 'completed' },
  { value: 'cancelled', label: 'Cancelados', keep: (row) => row.status === 'cancelled' },
  { value: 'all', label: 'Todos', keep: () => true },
];

function Contracts() {
  const contracts = useQuery({
    queryKey: ['manager', 'contracts'],
    queryFn: () => api<AdminContractRow[]>('/manager/contracts'),
  });
  const [chosen, setFilter] = useState<Filter | null>(null);
  const [query, setQuery] = useState('');
  const rows = contracts.data ?? [];
  // Start where there is something to do, or with everything when nothing needs a look.
  const filter =
    chosen ?? (rows.some((row) => row.flags.length > 0) ? 'attention' : 'all');
  const keep = FILTERS.find((f) => f.value === filter)?.keep ?? (() => true);
  const shown = rows.filter(
    (row) =>
      keep(row) &&
      matches(
        [row.jobTitle, row.startup.name, row.specialist.name, row.escrowId, row.id],
        query,
      ),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contratos"
        description="Todos los contratos de Pocket. Abre uno para ver su dinero, sus hitos y cada paso comprobado contra Stellar."
      />
      {contracts.error ? (
        <ErrorAlert error={contracts.error} onRetry={() => contracts.refetch()} />
      ) : null}
      {!contracts.data && !contracts.error ? <Loading /> : null}
      {contracts.data ? (
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
              placeholder="Buscar por trabajo o persona"
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState title="Ningún contrato aquí">
              {filter === 'attention'
                ? 'Nada requiere atención ahora.'
                : 'Prueba con otro filtro u otra búsqueda.'}
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {shown.map((row) => (
                <ContractLine key={row.id} row={row} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}

function ContractLine({ row }: { row: AdminContractRow }) {
  return (
    <li>
      <Link
        href={`/manager/contracts/${row.id}`}
        className="grid gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-celeste md:grid-cols-[minmax(0,1fr)_9rem_9rem_7rem_auto] md:items-center"
      >
        <span className="min-w-0 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-navy">{row.jobTitle}</span>
            <StatusBadge status={row.status} />
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {row.startup.name ?? 'Startup sin nombre'} contrató a{' '}
            {row.specialist.name ?? 'un experto sin nombre'} ·{' '}
            {CATEGORY_LABELS[row.category]}
          </span>
          {row.flags.length > 0 ? (
            <span className="flex flex-wrap gap-1 pt-1">
              {row.flags.map((flag) => (
                <FlagBadge key={flag} flag={flag} />
              ))}
            </span>
          ) : null}
        </span>
        <Figure
          label="Liberado"
          value={`${short(row.released)} de ${short(row.amount)}`}
          unit="USDC"
          meter={Number(row.amount) > 0 ? Number(row.released) / Number(row.amount) : 0}
        />
        <Figure
          label="Hitos pagados"
          value={`${row.milestones.done} de ${row.milestones.total}`}
          meter={
            row.milestones.total > 0 ? row.milestones.done / row.milestones.total : 0
          }
        />
        <Figure
          label={row.nextDue ? 'Próxima entrega' : 'Último movimiento'}
          value={shortDay(row.nextDue ?? row.lastActivityAt)}
        />
        <ChevronRightIcon
          className="hidden size-4 text-muted-foreground md:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function Figure({
  label,
  value,
  unit,
  meter,
}: {
  label: string;
  value: string;
  unit?: string;
  meter?: number;
}) {
  return (
    <span className="min-w-0 text-sm">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block font-medium text-navy tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-xs text-muted-foreground">{unit}</span> : null}
      </span>
      {meter !== undefined ? (
        <span
          className="mt-1 block h-1 overflow-hidden rounded-full bg-celeste-light/60"
          aria-hidden
        >
          <span
            className="block h-full rounded-full bg-navy"
            style={{ width: `${Math.round(Math.min(Math.max(meter, 0), 1) * 100)}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}

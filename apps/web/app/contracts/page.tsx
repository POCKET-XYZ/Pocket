'use client';

import type { ContractSummary, User } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { UsdcStatus } from '@/components/usdc-status';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, date, usdc } from '@/lib/format';

export default function ContractsPage() {
  return (
    <RequireAuth roles={['startup', 'specialist']}>
      {(user) => <Contracts user={user} />}
    </RequireAuth>
  );
}

/** What the signed-in user has to do next on a contract, if anything. */
function nextStep(contract: ContractSummary, user: User): string | null {
  const isStartup = user.role === 'startup';
  if (contract.status === 'awaiting_specialist')
    return isStartup ? null : 'Revisa los términos';
  if (contract.status === 'awaiting_funding')
    return isStartup ? 'Deposita el pago en el contrato' : null;
  if (contract.status !== 'active') return null;
  const statuses = contract.milestones.map((milestone) => milestone.status);
  if (isStartup && statuses.includes('delivered')) return 'Revisa una entrega';
  if (!isStartup && statuses.some((s) => s === 'pending' || s === 'changes_requested'))
    return 'Entrega un hito';
  return null;
}

function Contracts({ user }: { user: User }) {
  const contracts = useQuery({
    queryKey: ['contracts', 'mine'],
    queryFn: () => api<ContractSummary[]>('/contracts/mine'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contratos"
        description="El pago de cada contrato queda guardado aparte en Stellar y se libera hito por hito."
      />
      <UsdcStatus user={user} />
      {contracts.isLoading ? (
        <Loading />
      ) : contracts.error ? (
        <ErrorAlert error={contracts.error} />
      ) : contracts.data && contracts.data.length > 0 ? (
        <div className="space-y-3">
          {contracts.data.map((contract) => {
            const paid = contract.milestones.filter(
              (m) => m.status === 'paid' || m.status === 'resolved',
            ).length;
            const step = nextStep(contract, user);
            return (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition hover:border-celeste md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-heading text-lg font-semibold text-navy">
                    {contract.job.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {CATEGORY_LABELS[contract.job.category]} · {usdc(contract.amount)} ·
                    iniciado el {date(contract.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {step ? (
                    <span className="rounded-full bg-yellow px-3 py-1 text-xs font-semibold text-navy">
                      {step}
                    </span>
                  ) : null}
                  <span className="text-sm text-muted-foreground">
                    {paid}/{contract.milestones.length} hitos completados
                  </span>
                  <StatusBadge status={contract.status} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Todavía no tienes contratos">
          {user.role === 'startup'
            ? 'Contrata a un postulante desde uno de tus trabajos.'
            : 'Postúlate a trabajos; cuando una startup te elija, los términos aparecerán aquí.'}
        </EmptyState>
      )}
    </div>
  );
}

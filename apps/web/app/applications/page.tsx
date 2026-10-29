'use client';

import type { MyApplication, User } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { Onboarding } from '@/components/onboarding';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { UsdcStatus } from '@/components/usdc-status';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { dateTime, usdc } from '@/lib/format';

export default function ApplicationsPage() {
  return (
    <RequireAuth roles={['specialist']}>
      {(user) => <Applications user={user} />}
    </RequireAuth>
  );
}

function Applications({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const applications = useQuery({
    queryKey: ['applications', 'mine'],
    queryFn: () => api<MyApplication[]>('/applications/mine'),
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => api(`/applications/${id}/withdraw`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Postulación retirada');
      await queryClient.invalidateQueries({ queryKey: ['applications', 'mine'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-6">
      <Onboarding className="mb-6" />
      <PageHeader
        title="Mis postulaciones"
        description="Cuando una startup te elige, las condiciones aparecen en Contratos para que las aceptes."
        actions={
          <Button asChild variant="outline">
            <Link href="/contracts">Mis contratos</Link>
          </Button>
        }
      />
      <UsdcStatus user={user} />
      {applications.isLoading ? (
        <Loading />
      ) : applications.error ? (
        <ErrorAlert error={applications.error} />
      ) : applications.data && applications.data.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trabajo</TableHead>
                <TableHead>Tu precio</TableHead>
                <TableHead>Enviada</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.data.map((application) => (
                <TableRow key={application.id}>
                  <TableCell>
                    <Link
                      href={`/jobs/${application.job.id}`}
                      className="font-medium text-navy hover:underline"
                    >
                      {application.job.title}
                    </Link>
                  </TableCell>
                  <TableCell>{usdc(application.price)}</TableCell>
                  <TableCell>{dateTime(application.createdAt)}</TableCell>
                  <TableCell>
                    <StatusBadge feminine status={application.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {application.status === 'submitted' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={withdraw.isPending}
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: '¿Retirar esta postulación?',
                            confirmText: 'Retirar',
                            destructive: true,
                          });
                          if (confirmed) withdraw.mutate(application.id);
                        }}
                      >
                        Retirar
                      </Button>
                    ) : application.contract ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/contracts/${application.contract.id}`}>
                          {application.contract.status === 'awaiting_specialist'
                            ? 'Revisar las condiciones'
                            : 'Ver contrato'}
                        </Link>
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title="Todavía no te has postulado">
          <Button asChild className="mt-4">
            <Link href="/jobs">Explorar trabajos</Link>
          </Button>
        </EmptyState>
      )}
    </div>
  );
}

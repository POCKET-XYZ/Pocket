'use client';

import type { ChainCheck, ChainTotals } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CircleCheckIcon,
  ExternalLinkIcon,
  LinkIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import Link from 'next/link';
import { ErrorAlert } from '@/components/page';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { dateTime, explorerContract, usdc } from '@/lib/format';

const ROWS: { key: keyof ChainTotals; label: string }[] = [
  { key: 'funded', label: 'Depositado' },
  { key: 'released', label: 'Liberado' },
  { key: 'inEscrows', label: 'En contratos' },
  { key: 'pocketFee', label: 'Comisión de Pocket' },
];

/**
 * The database against Stellar, escrow by escrow, read when the manager asks:
 * reading every escrow takes a few seconds. Each difference is either a step
 * still landing or something to look into.
 */
export function ChainCheckSection() {
  const check = useQuery({
    queryKey: ['manager', 'chain-check'],
    queryFn: () => api<ChainCheck>('/manager/chain-check'),
    enabled: false,
    staleTime: Infinity,
  });
  const data = check.data;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-navy">
            <LinkIcon className="size-5" aria-hidden />
            Comprobado contra Stellar
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Lee cada contrato en la red y lo compara con lo que tiene Pocket: depósito,
            estado y monto de cada hito, y la comisión que recibió la cuenta de Pocket.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={check.isFetching}
          onClick={() => void check.refetch()}
        >
          {check.isFetching
            ? 'Leyendo la red...'
            : data
              ? 'Volver a comprobar'
              : 'Comprobar'}
        </Button>
      </div>

      {check.error ? (
        <ErrorAlert error={check.error} title="No se pudo leer la red" />
      ) : null}

      {data ? (
        <>
          <p className="flex items-center gap-2 font-medium text-navy">
            {data.differences.length === 0 ? (
              <>
                <CircleCheckIcon className="size-5 text-emerald-700" aria-hidden />
                {data.escrows === 1
                  ? '1 contrato, sin diferencias'
                  : `${data.escrows} contratos, sin diferencias`}
              </>
            ) : (
              <>
                <TriangleAlertIcon className="size-5 text-destructive" aria-hidden />
                {data.differences.length === 1
                  ? '1 diferencia'
                  : `${data.differences.length} diferencias`}{' '}
                en {data.escrows} {data.escrows === 1 ? 'contrato' : 'contratos'}
              </>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-normal" />
                  <th className="py-1 text-right font-normal">Pocket</th>
                  <th className="py-1 text-right font-normal">Stellar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ROWS.map((row) => {
                  const same =
                    data.totals.database[row.key] === data.totals.chain[row.key];
                  return (
                    <tr key={row.key}>
                      <td className="py-2 text-muted-foreground">{row.label}</td>
                      <td className="py-2 text-right tabular-nums text-navy">
                        {usdc(data.totals.database[row.key])}
                      </td>
                      <td
                        className={
                          same
                            ? 'py-2 text-right tabular-nums text-navy'
                            : 'py-2 text-right font-semibold tabular-nums text-destructive'
                        }
                      >
                        {usdc(data.totals.chain[row.key])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.differences.length > 0 ? (
            <ul className="space-y-2">
              {data.differences.map((difference, index) => (
                <li
                  key={`${difference.contractId}-${index}`}
                  className="rounded-xl border border-border p-3 text-sm"
                >
                  <Link
                    href={`/contracts/${difference.contractId}`}
                    className="font-medium text-navy underline-offset-2 hover:underline"
                  >
                    {difference.jobTitle}
                  </Link>
                  <p className="text-muted-foreground">{difference.what}</p>
                  <a
                    href={explorerContract(difference.escrowId)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs underline"
                  >
                    Ver el contrato en stellar.expert{' '}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Leído el {dateTime(data.checkedAt)}. Un paso que se está confirmando puede
            aparecer como diferencia unos segundos.
          </p>
        </>
      ) : null}
    </section>
  );
}

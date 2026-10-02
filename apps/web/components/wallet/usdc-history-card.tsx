'use client';

import type { UsdcPaymentRecord } from '@pocket/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ExternalLinkIcon,
  HistoryIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { dateTime, explorerTx, shortAddress } from '@/lib/format';

export const USDC_PAYMENTS_KEY = ['wallet', 'payments'] as const;

export function useUsdcPayments() {
  return useQuery({
    queryKey: USDC_PAYMENTS_KEY,
    queryFn: () => api<UsdcPaymentRecord[]>('/wallet/usdc-payments'),
    staleTime: 30_000,
  });
}

/** The latest USDC in and out of the wallet, read from the network. */
export function UsdcHistoryCard() {
  const payments = useUsdcPayments();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-5 text-navy" />
          Recent USDC payments
        </CardTitle>
      </CardHeader>
      <CardContent>
        {payments.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : payments.isError ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Could not load your payments from the Stellar network.
            </p>
            <Button variant="outline" size="sm" onClick={() => void payments.refetch()}>
              Try again
            </Button>
          </div>
        ) : payments.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No USDC payments yet. What you receive and send shows up here.
          </p>
        ) : (
          <ul className="divide-y">
            {payments.data.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentRow({ payment }: { payment: UsdcPaymentRecord }) {
  const incoming = payment.direction === 'in';
  const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  const amount = Number(payment.amount).toLocaleString('en-US', {
    maximumFractionDigits: 7,
  });

  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          incoming ? 'bg-green-100 text-green-700' : 'bg-muted text-navy'
        }`}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {incoming ? 'Received from' : 'Sent to'}{' '}
          <span className="font-mono" title={payment.counterparty}>
            {shortAddress(payment.counterparty)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{dateTime(payment.createdAt)}</p>
      </div>
      <p
        className={`shrink-0 text-right text-sm font-semibold ${
          incoming ? 'text-green-700' : 'text-navy'
        }`}
      >
        {incoming ? '+' : '-'}
        {amount} USDC
      </p>
      <a
        href={explorerTx(payment.txHash)}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 text-muted-foreground hover:text-navy"
        aria-label="View on the explorer"
        title="View on the explorer"
      >
        <ExternalLinkIcon className="size-4" />
      </a>
    </li>
  );
}

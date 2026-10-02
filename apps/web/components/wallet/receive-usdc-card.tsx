'use client';

import { ArrowDownToLineIcon, CopyIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUsdcStatus } from '@/components/usdc-status';

/** Where the page renders UsdcStatus, so this card can point to its fix. */
export const USDC_STATUS_ANCHOR = 'usdc-status';

/**
 * The address to give whoever pays the user, with the one rule that keeps the
 * money from being lost: only USDC, only on Stellar.
 */
export function ReceiveUsdcCard({ address }: { address: string }) {
  const status = useUsdcStatus();
  const ready = status.data?.usdc === 'ready';

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success('Address copied');
    } catch {
      toast.error('Could not copy. Select the address and copy it by hand.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowDownToLineIcon className="size-5 text-navy" />
          Receive USDC
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Your Stellar address</p>
          <p className="rounded-lg bg-muted p-3 font-mono text-sm break-all select-all">
            {address}
          </p>
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            <CopyIcon className="size-4" /> Copy address
          </Button>
        </div>

        <div className="flex gap-2 rounded-lg border border-yellow bg-yellow/15 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Only send <strong>USDC on the Stellar network</strong> to this address. USDC
            on another network (Ethereum, Solana, Base...) or any other asset sent here is
            lost and cannot be recovered.
          </p>
        </div>

        {status.data && !ready ? (
          <p className="text-sm">
            Your wallet cannot receive USDC yet.{' '}
            <a className="font-medium underline" href={`#${USDC_STATUS_ANCHOR}`}>
              Enable USDC
            </a>{' '}
            before you share this address.
          </p>
        ) : null}
        {ready ? (
          <p className="text-sm text-muted-foreground">
            USDC is enabled in your wallet, so it can receive USDC.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

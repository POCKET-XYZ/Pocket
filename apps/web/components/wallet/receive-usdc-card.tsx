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
      toast.success('Dirección copiada');
    } catch {
      toast.error('No se pudo copiar. Selecciona la dirección y cópiala a mano.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowDownToLineIcon className="size-5 text-navy" />
          Recibir USDC
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Tu dirección de Stellar</p>
          <p className="rounded-lg bg-muted p-3 font-mono text-sm break-all select-all">
            {address}
          </p>
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            <CopyIcon className="size-4" /> Copiar dirección
          </Button>
        </div>

        <div className="flex gap-2 rounded-lg border border-yellow bg-yellow/15 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Envía a esta dirección solo <strong>USDC en la red Stellar</strong>. Si envías
            aquí USDC de otra red (Ethereum, Solana, Base...) o cualquier otro activo, se
            pierde y no se puede recuperar.
          </p>
        </div>

        {status.data && !ready ? (
          <p className="text-sm">
            Tu wallet todavía no puede recibir USDC.{' '}
            <a className="font-medium underline" href={`#${USDC_STATUS_ANCHOR}`}>
              Habilita USDC
            </a>{' '}
            antes de compartir esta dirección.
          </p>
        ) : null}
        {ready ? (
          <p className="text-sm text-muted-foreground">
            USDC está habilitado en tu wallet, así que puede recibir USDC.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

'use client';

import { CopyIcon, TriangleAlertIcon } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useUsdcStatus } from '@/components/usdc-status';

/** Where the page renders UsdcStatus, so this card can point to its fix. */
export const USDC_STATUS_ANCHOR = 'usdc-status';

/**
 * The address to give whoever pays the user, as text and as a QR code, with
 * the one rule that keeps the money from being lost: only USDC, only on
 * Stellar.
 */
export function ReceiveUsdcPanel({
  address,
  throughPollar = false,
}: {
  address: string;
  /** A Pollar wallet's USDC is enabled on its own: no chore to point to. */
  throughPollar?: boolean;
}) {
  const status = useUsdcStatus();
  const ready = status.data?.usdc === 'ready';
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    // The address and nothing else, so any wallet that scans it fills only that.
    QRCode.toDataURL(address, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (current) setQr(url);
      })
      .catch(() => setQr(null));
    return () => {
      current = false;
    };
  }, [address]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success('Dirección copiada');
    } catch {
      toast.error('No se pudo copiar. Selecciona la dirección y cópiala a mano.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt="Código QR de tu dirección de Stellar"
            width={180}
            height={180}
            className="mx-auto size-44 shrink-0 rounded-lg border border-border bg-white p-1 sm:mx-0"
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">Tu dirección de Stellar</p>
          <p className="rounded-lg bg-muted p-3 font-mono text-sm break-all select-all">
            {address}
          </p>
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            <CopyIcon className="size-4" /> Copiar dirección
          </Button>
        </div>
      </div>

      <div className="flex gap-2 rounded-lg border border-warning bg-warning/15 p-3 text-sm">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          Envía a esta dirección solo <strong>USDC en la red Stellar</strong>. Si envías
          aquí USDC de otra red (Ethereum, Solana, Base...) o cualquier otro activo, se
          pierde y no se puede recuperar.
        </p>
      </div>

      {status.data && !ready ? (
        throughPollar ? (
          <p className="text-sm">
            Tu wallet se está terminando de preparar. Espera a que esté lista antes de
            compartir esta dirección.
          </p>
        ) : (
          <p className="text-sm">
            Tu wallet todavía no puede recibir USDC.{' '}
            <a className="font-medium underline" href={`#${USDC_STATUS_ANCHOR}`}>
              Habilita USDC
            </a>{' '}
            antes de compartir esta dirección.
          </p>
        )
      ) : null}
      {ready ? (
        <p className="text-sm text-muted-foreground">
          Tu wallet está lista para recibir USDC.
        </p>
      ) : null}
    </div>
  );
}

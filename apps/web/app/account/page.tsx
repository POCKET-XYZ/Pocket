'use client';

import { DownloadIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { PRIVACY_EMAIL } from '@/components/legal-page';
import { PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { useUsdcStatus } from '@/components/usdc-status';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { usdc } from '@/lib/format';

export default function AccountPage() {
  return (
    <RequireAuth>
      {() => (
        <div className="mx-auto max-w-3xl space-y-6">
          <PageHeader
            title="Tu cuenta y tus datos"
            description="Descarga todo lo que Pocket guarda sobre ti, o elimina tu cuenta."
          />
          <ExportCard />
          <RightsCard />
          <DeleteCard />
        </div>
      )}
    </RequireAuth>
  );
}

function ExportCard() {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const data = await api<unknown>('/users/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pocket-datos-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Descarga tus datos</CardTitle>
        <CardDescription>
          Tu cuenta, tus datos de registro, tu perfil, trabajos, postulaciones, contratos,
          entregas, disputas y registros de consentimiento, en un archivo JSON. Tu CV
          aparece en la lista; el PDF se descarga desde tu perfil.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" disabled={busy} onClick={() => void download()}>
          <DownloadIcon className="size-4" />
          {busy ? 'Preparando...' : 'Descargar mis datos'}
        </Button>
      </CardContent>
    </Card>
  );
}

function RightsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Corrige o limita el uso de tus datos</CardTitle>
        <CardDescription>
          Corrige tu perfil desde{' '}
          <Link href="/profile" className="underline">
            tu página de perfil
          </Link>
          . Para corregir cualquier otra cosa, oponerte a un uso de tus datos, retirar un
          consentimiento o preguntar algo sobre tus datos, escribe a {PRIVACY_EMAIL}.
          Todos tus derechos están en la{' '}
          <Link href="/privacy" className="underline">
            Política de Privacidad
          </Link>
          .
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function DeleteCard() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const wallet = useUsdcStatus(user?.role !== 'manager');
  const leftInWallet =
    Number(wallet.data?.usdcSpendable ?? 0) > 0 ? wallet.data?.usdcSpendable : null;

  if (user?.role === 'manager') return null;

  async function remove() {
    setBusy(true);
    try {
      await api('/users/me/delete', {
        method: 'POST',
        body: { confirm: confirm.trim() },
      });
      toast.success('Tu cuenta se eliminó');
      signOut();
      router.replace('/');
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Elimina tu cuenta</CardTitle>
        <CardDescription>
          No se puede deshacer. Si quieres una copia, descarga tus datos antes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Se borra: tu perfil, tu CV, los datos de tu cuenta, tu correo y el vínculo
            entre tu cuenta y tu wallet. Se cierra tu sesión en todos lados.
          </li>
          <li>
            Se cierra: tus trabajos abiertos y tus postulaciones pendientes. Las ofertas
            que el experto todavía no responde se retiran.
          </li>
          <li>
            Se guarda, ligado a una cuenta anónima: los contratos, pagos y disputas en los
            que participaste, porque también son registros de la otra parte y la ley nos
            pide conservarlos.
          </li>
          <li>
            No se puede mientras haya dinero tuyo guardado en un contrato: primero termina
            o resuelve esos contratos.
          </li>
          <li>
            Tu wallet y sus pagos se quedan en la red de Stellar, que nadie puede borrar.
            Una wallet de Pollar se queda con Pollar.
          </li>
        </ul>
        {leftInWallet ? <UsdcLeft amount={leftInWallet} /> : null}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2Icon className="size-4" />
              Eliminar mi cuenta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Eliminar tu cuenta?</DialogTitle>
              <DialogDescription>
                Escribe ELIMINAR para confirmar. No se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            {leftInWallet ? <UsdcLeft amount={leftInWallet} /> : null}
            <Input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="ELIMINAR"
              aria-label="Escribe ELIMINAR para confirmar"
            />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={confirm.trim() !== 'ELIMINAR' || busy}
                onClick={() => void remove()}
              >
                {busy ? 'Eliminando...' : 'Eliminar mi cuenta'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/**
 * USDC still in the wallet: once the account is gone, the wallet is no longer
 * reachable from Pocket, so the money should go somewhere else first.
 */
function UsdcLeft({ amount }: { amount: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-warning bg-warning/15 p-3 text-sm text-navy">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        Tienes <strong>{usdc(amount)}</strong> en tu wallet. Después de eliminar la cuenta
        ya no podrás moverlos desde Pocket: envíalos antes a otra wallet desde{' '}
        <Link href="/wallet" className="font-medium underline">
          Billetera
        </Link>
        .
      </p>
    </div>
  );
}

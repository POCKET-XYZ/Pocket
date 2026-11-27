'use client';

import type { ContractDetail } from '@pocket/shared';
import { useQueryClient } from '@tanstack/react-query';
import { RepeatIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

/**
 * An account that is a startup and an expert, opening a contract of its other
 * side: what it can do here belongs to that side, so the page offers to switch
 * to it in one tap and stays on the contract.
 */
export function ModeSwitchNotice({
  contract,
  side,
  startupName,
}: {
  contract: ContractDetail;
  side: 'startup' | 'specialist';
  startupName: string;
}) {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const target = side === 'specialist' ? 'Experto' : startupName;

  async function switchHere() {
    setBusy(true);
    try {
      // A contract of one of the account's startups: act as that startup.
      if (side === 'startup' && contract.startupProfileId) {
        await api('/users/me/startup', {
          method: 'PUT',
          body: { startupId: contract.startupProfileId },
        });
      } else {
        await api('/users/me/role', { method: 'PUT', body: { role: side } });
      }
      await refreshUser();
      // Everything cached belongs to the side the account just left.
      await queryClient.invalidateQueries();
      toast.success(`Ahora estás como ${target}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Alert className="border-warning bg-warning/10">
      <AlertTitle>
        {side === 'specialist'
          ? 'En este contrato eres el experto'
          : `Este contrato es de ${startupName}`}
      </AlertTitle>
      <AlertDescription>
        <p>
          {side === 'specialist'
            ? 'Ahora estás usando Pocket como empresa. Para aceptar, entregar o cobrar aquí, cambia a experto.'
            : `Ahora estás usando Pocket como experto. Para revisar, aprobar o pagar aquí, cambia a ${startupName}.`}
        </p>
        <Button
          size="sm"
          className="mt-3"
          disabled={busy}
          onClick={() => void switchHere()}
        >
          <RepeatIcon /> {busy ? 'Cambiando...' : `Cambiar a ${target}`}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

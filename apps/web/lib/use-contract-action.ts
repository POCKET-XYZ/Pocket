'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { isWalletDismissed } from '@/lib/wallet';

/**
 * A mutation on a contract: shows the outcome as a toast, ignores a closed
 * wallet modal, and reloads the contract and the lists that depend on it.
 */
export function useContractAction<TArgs = void>(
  contractId: string,
  action: (args: TArgs) => Promise<unknown>,
  success: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      toast.success(success);
    },
    onError: (error) => {
      if (!isWalletDismissed(error)) toast.error(errorMessage(error));
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contracts', contractId] }),
        queryClient.invalidateQueries({ queryKey: ['contracts', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['wallet', 'usdc'] }),
        // Accepting, declining or paying also changes jobs, applications and disputes.
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['disputes'] }),
      ]);
    },
  });
}

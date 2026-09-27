'use client';

import {
  getSelectedWallet,
  getWalletNetwork,
  openAuthModal,
  signTransaction,
} from '@/components/tw-blocks/wallet-kit/wallet-kit';
import { api } from './api';

const NETWORK_NAMES: Record<string, string> = {
  'Public Global Stellar Network ; September 2015': 'Mainnet',
  'Test SDF Network ; September 2015': 'Testnet',
};

function networkName(passphrase: string): string {
  return NETWORK_NAMES[passphrase] ?? 'another network';
}

/**
 * Stop before asking for a signature the wallet would refuse, or sign for the
 * wrong network: say which network to switch to. Wallets that cannot report
 * their network are let through.
 */
async function requireWalletNetwork(expected: string | undefined): Promise<void> {
  if (!expected) return;
  let actual: string | undefined;
  try {
    ({ networkPassphrase: actual } = await getWalletNetwork());
  } catch {
    return;
  }
  if (actual && actual !== expected) {
    throw new Error(
      `Your wallet is on ${networkName(actual)}. Switch it to ${networkName(expected)} and try again.`,
    );
  }
}

/** Open the wallet picker and return the chosen address and wallet name. */
export async function connectWallet(): Promise<{ address: string; walletName: string }> {
  const { address } = await openAuthModal();
  const { productName } = await getSelectedWallet();
  return { address, walletName: productName };
}

/** Sign a transaction XDR with the connected wallet. */
export async function signXdr(
  xdr: string,
  address: string,
  networkPassphrase?: string,
): Promise<string> {
  await requireWalletNetwork(networkPassphrase);
  return signTransaction({ unsignedTransaction: xdr, address, networkPassphrase });
}

/** A transaction the API prepared for the user's wallet. */
export interface PreparedTransaction {
  operationId: string;
  xdr: string;
  networkPassphrase: string;
}

/**
 * Signs a transaction with whichever wallet the user signed in with. Use
 * `useSigner()` to get one instead of picking a wallet by hand.
 */
export type SignXdr = (xdr: string, networkPassphrase?: string) => Promise<string>;

/**
 * The loop every money step follows: the API prepares the transaction, the
 * user's wallet signs it, and the API broadcasts it and checks the result on
 * chain. Pocket never holds a key, whoever signs.
 */
export async function prepareSignSubmit<T>(
  sign: SignXdr,
  preparePath: string,
  submitPath: string,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const prepared = await api<PreparedTransaction>(preparePath, { method: 'POST' });
  const signedXdr = await sign(prepared.xdr, prepared.networkPassphrase);
  return api<T>(submitPath, { method: 'POST', body: { signedXdr, ...extra } });
}

/**
 * True when the user closed the wallet picker instead of failing. Only that
 * exact rejection: the kit also uses code -1 for any wallet error without a
 * code of its own, and those must be shown.
 */
export function isWalletDismissed(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    (error as { message: unknown }).message === 'The user closed the modal.'
  );
}

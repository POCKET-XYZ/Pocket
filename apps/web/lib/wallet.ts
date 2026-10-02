'use client';

import {
  getSelectedWallet,
  getWalletNetwork,
  openAuthModal,
  signTransaction,
} from '@/components/tw-blocks/wallet-kit/wallet-kit';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { api } from './api';
import { NETWORK, type TxPurpose } from './tx-check';

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
  const signed = await signTransaction({
    unsignedTransaction: xdr,
    address,
    networkPassphrase,
  });
  requireSignedBy(signed, address, networkPassphrase);
  return signed;
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * An extension signs with whatever account is active in it. When that is not
 * the account signed in to Pocket, say so plainly instead of letting the
 * network refuse a signature from the wrong key.
 */
function requireSignedBy(signedXdr: string, address: string, networkPassphrase?: string) {
  let hints: string[];
  try {
    // Without a passphrase from the API, read it on the network Pocket runs on.
    const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase ?? NETWORK);
    hints = tx.signatures.map((signature) => hex(signature.hint.toBytes()));
  } catch {
    return; // Not readable here: the API still checks the signature.
  }
  const expected = hex(Keypair.fromPublicKey(address).signatureHint());
  if (!hints.includes(expected)) {
    throw new Error(
      `Your wallet signed with a different account. Switch it to ${address.slice(0, 4)}...${address.slice(-4)}, the one you signed in with, and try again.`,
    );
  }
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
export type SignXdr = (
  xdr: string,
  networkPassphrase: string | undefined,
  purpose: TxPurpose,
) => Promise<string>;

/**
 * The loop every money step follows: the API prepares the transaction, the
 * user's wallet signs it, and the API broadcasts it and checks the result on
 * chain. Pocket never holds a key, whoever signs.
 */
export async function prepareSignSubmit<T>(
  sign: SignXdr,
  purpose: TxPurpose,
  preparePath: string,
  submitPath: string,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const prepared = await api<PreparedTransaction>(preparePath, { method: 'POST' });
  const signedXdr = await sign(prepared.xdr, prepared.networkPassphrase, purpose);
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

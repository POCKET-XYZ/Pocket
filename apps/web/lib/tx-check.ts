import {
  Address,
  Asset,
  FeeBumpTransaction,
  Networks,
  scValToNative,
  TransactionBuilder,
  type Transaction,
  type xdr,
} from '@stellar/stellar-sdk';
import { toUnits } from './usdc';

const IS_MAINNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet';
/** The network Pocket runs on, from NEXT_PUBLIC_STELLAR_NETWORK. */
export const NETWORK = IS_MAINNET ? Networks.PUBLIC : Networks.TESTNET;
/** Circle's USDC on each network. */
const USDC = new Asset(
  'USDC',
  IS_MAINNET
    ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
    : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
);
/** A user step costs well under 0.1 XLM; anything near this is not a fee. */
const MAX_FEE_STROOPS = 20_000_000;

/** The escrow calls a user signs, by the step that asks for them. */
const ESCROW_FUNCTIONS = {
  fund: 'fund_escrow',
  approve: 'approve_milestone',
  dispute: 'dispute_milestone',
} as const;

/** What the user is about to sign, as the page that asks for it knows it. */
export type TxPurpose =
  | { kind: 'usdc-trustline' }
  /** A deposit: the page knows how much the startup agreed to put in. */
  | { kind: 'fund'; escrowId: string | null | undefined; amount: string }
  | { kind: 'approve' | 'dispute'; escrowId: string | null | undefined }
  /**
   * USDC sent from the wallet to another address: exactly what the user
   * confirmed. An empty memo means none.
   */
  | { kind: 'usdc-payment'; destination: string; amount: string; memo: string };

/** Thrown when a transaction is not the one the page asked for. */
export class UnexpectedTransaction extends Error {
  constructor(reason: string) {
    super(
      `Pocket detuvo esta firma porque ${reason}. No se firmó nada. Recarga la página e inténtalo de nuevo.`,
    );
    this.name = 'UnexpectedTransaction';
  }
}

/**
 * Checks, before the wallet sees it, that a transaction from the API is the
 * step the user pressed: their own account, this network, one operation, and
 * either the USDC trustline, the USDC payment they confirmed, or the expected
 * call on this contract's escrow.
 * The wallet shows raw XDR most users cannot read, so this is what stands
 * between a compromised API and a signature that moves their money.
 */
export function checkTransaction(
  unsignedXdr: string,
  networkPassphrase: string | undefined,
  signer: string,
  purpose: TxPurpose,
): void {
  const refuse = (reason: string): never => {
    throw new UnexpectedTransaction(reason);
  };

  // An unsigned transaction does not name its network; the signature does, so
  // the network the wallet is asked to sign for is what must match.
  if (networkPassphrase && networkPassphrase !== NETWORK) refuse('es para otra red');

  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(unsignedXdr, NETWORK);
  } catch {
    return refuse('no se pudo leer la transacción');
  }
  if (parsed instanceof FeeBumpTransaction) {
    return refuse('viene envuelta en otra transacción (fee bump)');
  }
  const tx = parsed;
  if (tx.source !== signer) refuse('se paga desde otra cuenta');
  if (Number(tx.fee) > MAX_FEE_STROOPS) refuse('su comisión de red es demasiado alta');
  if (tx.operations.length !== 1) refuse('hace más de una cosa');

  const [op] = tx.operations;
  if (op.source && op.source !== signer) refuse('actúa en nombre de otra cuenta');

  if (purpose.kind === 'usdc-trustline') {
    if (
      op.type !== 'changeTrust' ||
      !(op.line instanceof Asset) ||
      !op.line.equals(USDC)
    ) {
      refuse('no es la habilitación de USDC');
    }
    return;
  }

  if (purpose.kind === 'usdc-payment') {
    if (op.type !== 'payment') return refuse('no es un pago');
    if (!op.asset.equals(USDC)) refuse('paga con otro activo');
    if (op.destination !== purpose.destination) refuse('le paga a otro destinatario');
    if (toUnits(op.amount) !== toUnits(purpose.amount)) refuse('paga otro monto');
    if (memoText(tx) !== purpose.memo) refuse('su memo no es el que escribiste');
    return;
  }

  if (!purpose.escrowId) return refuse('este contrato todavía no existe en Stellar');
  if (op.type !== 'invokeHostFunction') return refuse('no es una llamada al contrato');
  if (tagOf(op.func) !== 'hostFunctionTypeInvokeContract') {
    return refuse('no es una llamada a un contrato');
  }
  const call = field<xdr.InvokeContractArgs>(op.func, 'invokeContract');
  const contract = Address.fromScAddress(field(call, 'contractAddress')).toString();
  if (contract !== purpose.escrowId) refuse('llama a otro contrato');
  const fn = ESCROW_FUNCTIONS[purpose.kind];
  if (String(field(call, 'functionName')) !== fn) refuse('pide otra acción del contrato');

  // What the signature authorizes: this escrow's call, and for a deposit the
  // USDC transfer the escrow pulls. Nothing else, and nothing deeper.
  const usdcContract = USDC.contractId(NETWORK);
  for (const entry of op.auth ?? []) {
    const root = field<xdr.SorobanAuthorizedInvocation>(entry, 'rootInvocation');
    const [rootContract, rootFn] = authorized(root);
    if (rootContract !== purpose.escrowId || rootFn !== fn) {
      refuse('autoriza otro contrato');
    }
    for (const sub of field<xdr.SorobanAuthorizedInvocation[]>(root, 'subInvocations')) {
      const [subContract, subFn] = authorized(sub);
      const nested = field<xdr.SorobanAuthorizedInvocation[]>(sub, 'subInvocations');
      if (purpose.kind !== 'fund') return refuse('autoriza un pago');
      if (subContract !== usdcContract || subFn !== 'transfer' || nested.length > 0) {
        refuse('autoriza otro pago');
      }
      // The payment itself: from the user, into this escrow, the agreed amount.
      const [from, to, amount] = transferArgs(sub);
      if (from !== signer || to !== purpose.escrowId) {
        refuse('le paga a otro destinatario');
      }
      if (amount !== toUnits(purpose.amount)) refuse('paga otro monto');
    }
  }
}

/** What the API's login challenge writes, and nothing else may. */
const CHALLENGE_DATA_NAME = 'Pocket auth';

/**
 * Checks the login challenge before the wallet signs it. Users sign it
 * without thinking twice ("it's just the login"), so it must be impossible to
 * turn into anything that moves money: one data entry named for Pocket, on the
 * user's own account, with a sequence number no real account can use, so the
 * signed challenge can never be submitted to the network.
 */
export function checkLoginChallenge(
  unsignedXdr: string,
  networkPassphrase: string | undefined,
  signer: string,
): void {
  const refuse = (reason: string): never => {
    throw new UnexpectedTransaction(reason);
  };
  if (networkPassphrase && networkPassphrase !== NETWORK) refuse('es para otra red');
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(unsignedXdr, NETWORK);
  } catch {
    return refuse('no se pudo leer el desafío de inicio de sesión');
  }
  if (parsed instanceof FeeBumpTransaction) {
    return refuse('viene envuelta en otra transacción (fee bump)');
  }
  const tx = parsed;
  if (tx.source !== signer) refuse('el desafío de inicio de sesión es para otra cuenta');
  // Accounts start far above this, so it can never be the next sequence.
  if (tx.sequence !== '1') {
    refuse('el desafío de inicio de sesión se podría enviar a la red');
  }
  if (tx.operations.length !== 1) {
    refuse('el desafío de inicio de sesión hace más de una cosa');
  }
  const [op] = tx.operations;
  if (op.type !== 'manageData' || op.name !== CHALLENGE_DATA_NAME) {
    refuse('el desafío de inicio de sesión no es un desafío de inicio de sesión');
  }
  if (op.source && op.source !== signer) refuse('actúa en nombre de otra cuenta');
}

/**
 * A transaction's memo as text: empty for none, null for a memo that is not
 * text (an id or hash), which never matches what the user typed.
 */
function memoText(tx: Transaction): string | null {
  if (tx.memo.type === 'none') return '';
  if (tx.memo.type !== 'text') return null;
  const value = tx.memo.value;
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(value);
    } catch {
      return null;
    }
  }
  return null;
}

/** The from, to and amount of an authorized token transfer. */
function transferArgs(invocation: xdr.SorobanAuthorizedInvocation): [unknown, unknown, unknown] {
  const fn = field<xdr.SorobanAuthorizedFunction>(invocation, 'function');
  const call = field<xdr.InvokeContractArgs>(fn, 'contractFn');
  const args = field<xdr.ScVal[]>(call, 'args').map((arg) => scValToNative(arg) as unknown);
  if (args.length !== 3) {
    throw new UnexpectedTransaction('autoriza un pago con un formato inesperado');
  }
  return [args[0], args[1], typeof args[2] === 'bigint' ? args[2] : undefined];
}

/** The contract and function an authorization entry covers. */
function authorized(invocation: xdr.SorobanAuthorizedInvocation): [string, string] {
  const fn = field<xdr.SorobanAuthorizedFunction>(invocation, 'function');
  if (tagOf(fn) !== 'sorobanAuthorizedFunctionTypeContractFn') {
    throw new UnexpectedTransaction('autoriza crear un contrato');
  }
  const call = field<xdr.InvokeContractArgs>(fn, 'contractFn');
  return [
    Address.fromScAddress(field(call, 'contractAddress')).toString(),
    String(field(call, 'functionName')),
  ];
}

/**
 * Reads a field of a decoded XDR value. The SDK's codec exposes fields as
 * properties while its type declarations describe methods, so accept either.
 */
function field<T>(value: unknown, name: string): T {
  const member = (value as Record<string, unknown>)[name];
  return (typeof member === 'function' ? (member as () => T).call(value) : member) as T;
}

/** The arm of a decoded XDR union, as its name. */
function tagOf(union: unknown): string {
  const tag = field<unknown>(union, 'switch') ?? field<unknown>(union, 'type');
  if (typeof tag === 'string') return tag;
  const named = tag as { name?: unknown } | undefined;
  if (typeof named?.name === 'string') return named.name;
  if (union && typeof union === 'object') {
    return union.constructor.name.replace(/^./, (c) => c.toLowerCase());
  }
  return String(tag);
}

import {
  Address,
  FeeBumpTransaction,
  scValToNative,
  TransactionBuilder,
  type Transaction,
  type xdr,
} from '@stellar/stellar-sdk';

/**
 * What a transaction Trustless Work built may do before the platform key signs
 * it. The key is release signer and dispute resolver of every escrow, so a
 * transaction it signs blindly could add a signer to the account, pay its XLM
 * away, or send an escrow's money to a stranger. Nothing is signed unless it is
 * exactly the one contract call Pocket asked for, with the arguments it asked
 * for.
 */
export interface PlatformTxPolicy {
  /** The contract the call must target. */
  contractId: string;
  /** The contract function the call must invoke. */
  fn: string;
  /** Highest total fee, in stroops, the platform accepts to pay. */
  maxFeeStroops: number;
  /**
   * Checks the call's arguments, decoded to plain values (addresses as strings,
   * integers as bigint or number). Throws when they are not what Pocket asked.
   */
  checkArgs: (args: unknown[]) => void;
}

/** Thrown when a transaction does not match its policy. Nothing is signed. */
export class PlatformTxRefused extends Error {
  constructor(reason: string) {
    super(`The platform refused to sign: ${reason}`);
    this.name = 'PlatformTxRefused';
  }
}

/**
 * Returns the parsed transaction when it matches the policy, and throws
 * otherwise. Fails closed: any shape it does not recognise is refused.
 */
export function assertPlatformTx(
  unsignedXdr: string,
  networkPassphrase: string,
  platformAddress: string,
  policy: PlatformTxPolicy,
): Transaction {
  const refuse = (reason: string): never => {
    throw new PlatformTxRefused(reason);
  };

  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
  } catch {
    return refuse('not a transaction for this network');
  }
  if (parsed instanceof FeeBumpTransaction) return refuse('fee bumps are not signed');
  const tx = parsed;

  if (tx.source !== platformAddress) refuse('the source is not the platform');
  if (Number(tx.fee) > policy.maxFeeStroops) refuse(`the fee ${tx.fee} is too high`);
  if (tx.operations.length !== 1) refuse('expected exactly one operation');

  const [op] = tx.operations;
  if (op.type !== 'invokeHostFunction') return refuse(`unexpected operation ${op.type}`);
  if (op.source && op.source !== platformAddress) refuse('the operation has another source');

  const fn = op.func;
  if (tagOf(fn) !== 'hostFunctionTypeInvokeContract') return refuse('not a contract call');
  const call = field<xdr.InvokeContractArgs>(fn, 'invokeContract');
  const contract = Address.fromScAddress(field(call, 'contractAddress')).toString();
  const name = String(field(call, 'functionName'));
  if (contract !== policy.contractId) refuse(`unexpected contract ${contract}`);
  if (name !== policy.fn) refuse(`unexpected function ${name}`);

  let args: unknown[];
  try {
    args = field<xdr.ScVal[]>(call, 'args').map((arg) => scValToNative(arg) as unknown);
  } catch {
    return refuse('the arguments cannot be read');
  }
  try {
    policy.checkArgs(args);
  } catch (error) {
    refuse((error as Error).message);
  }

  // The authorization tree may only reach the same contract and function, and
  // may not create contracts: the deploy itself is the call above.
  const walk = (invocation: xdr.SorobanAuthorizedInvocation): void => {
    const authorized = field<xdr.SorobanAuthorizedFunction>(invocation, 'function');
    const kind = tagOf(authorized);
    if (kind !== 'sorobanAuthorizedFunctionTypeContractFn') {
      refuse(`unexpected authorization ${kind}`);
    }
    const target = field<xdr.InvokeContractArgs>(authorized, 'contractFn');
    const targetContract = Address.fromScAddress(field(target, 'contractAddress')).toString();
    if (targetContract !== policy.contractId) refuse(`authorization reaches ${targetContract}`);
    field<xdr.SorobanAuthorizedInvocation[]>(invocation, 'subInvocations').forEach(walk);
  };
  for (const entry of op.auth ?? []) {
    if (tagOf(field(entry, 'credentials')) !== 'sorobanCredentialsSourceAccount') {
      refuse('authorization for an account other than the source');
    }
    walk(field<xdr.SorobanAuthorizedInvocation>(entry, 'rootInvocation'));
  }

  return tx;
}

/**
 * Reads a field of a decoded XDR value. The codec the SDK ships exposes fields
 * as properties while its type declarations still describe methods, so this
 * accepts either rather than trusting the types.
 */
function field<T>(value: unknown, name: string): T {
  const member = (value as Record<string, unknown>)[name];
  return (typeof member === 'function'
    ? (member as () => T).call(value)
    : member) as T;
}

/** The arm of a decoded XDR union, as its name. */
function tagOf(union: unknown): string {
  const tag = field<unknown>(union, 'switch') ?? field<unknown>(union, 'type');
  if (typeof tag === 'string') return tag;
  const named = tag as { name?: unknown } | undefined;
  if (typeof named?.name === 'string') return named.name;
  if (union && typeof union === 'object') return union.constructor.name.replace(/^./, (c) => c.toLowerCase());
  return String(tag);
}

/** Throws with `message` unless `condition` holds. */
export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Amount of an asset with 7 decimals, as the chain counts it. */
export function toStroops(amount: string | number | { toString(): string }): bigint {
  const [whole, fraction = ''] = String(amount).split('.');
  return BigInt(whole) * 10_000_000n + BigInt((fraction + '0000000').slice(0, 7));
}

/** Whether a decoded integer argument equals `expected`, whatever its JS type. */
export function sameInteger(value: unknown, expected: number | bigint): boolean {
  return (
    (typeof value === 'number' || typeof value === 'bigint') &&
    BigInt(value) === BigInt(expected)
  );
}

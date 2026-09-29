import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Account,
  Address,
  Contract,
  rpc,
  scValToNative,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';

/** A milestone of an escrow as its contract stores it. */
export interface ChainMilestone {
  /** In stroops: 10^-7 USDC. */
  amount: bigint;
  receiver: string;
  flags: { approved: boolean; released: boolean; disputed: boolean; resolved: boolean };
}

/** An escrow as its contract stores it, read from the chain. */
export interface ChainEscrow {
  engagementId: string;
  roles: Record<string, string>;
  trustline: string;
  platformFee: bigint;
  milestones: ChainMilestone[];
}

export type ChainTxStatus = 'SUCCESS' | 'FAILED' | 'NOT_FOUND';

/**
 * Reads escrows and transactions straight from a Soroban RPC node, so what
 * counts as funded, released or resolved is what the chain says, not what
 * Trustless Work reports: the platform does not take a third party's word for
 * where money is.
 */
@Injectable()
export class SorobanReader {
  protected server: rpc.Server;
  /** Simulations need a source account; nothing is signed or sent. */
  private readonly reader: Account;

  constructor(
    config: ConfigService,
    private readonly stellar: StellarService,
  ) {
    const url = config.getOrThrow<string>('stellar.sorobanRpcUrl');
    this.server = new rpc.Server(url, { allowHttp: url.startsWith('http://localhost') });
    this.reader = new Account(stellar.platformAddress, '0');
  }

  /** The escrow's stored state, or null when there is no such contract. */
  async escrow(contractId: string): Promise<ChainEscrow | null> {
    const value = await this.call(contractId, 'get_escrow');
    if (value === undefined) return null;
    const raw = value as {
      engagement_id: string;
      roles: Record<string, string>;
      trustline: { address: string };
      platform_fee: bigint | number;
      milestones: {
        amount: bigint | number;
        receiver: string;
        flags: Record<string, boolean>;
      }[];
    };
    return {
      engagementId: raw.engagement_id,
      roles: raw.roles,
      trustline: raw.trustline.address,
      platformFee: BigInt(raw.platform_fee),
      milestones: raw.milestones.map((milestone) => ({
        amount: BigInt(milestone.amount),
        receiver: milestone.receiver,
        flags: {
          approved: milestone.flags.approved === true,
          released: milestone.flags.released === true,
          disputed: milestone.flags.disputed === true,
          resolved: milestone.flags.resolved === true,
        },
      })),
    };
  }

  /** USDC an address holds, in stroops, from the asset's own contract. */
  async usdcBalance(holder: string): Promise<bigint> {
    const value = await this.call(
      this.stellar.usdcContractId,
      'balance',
      new Address(holder).toScVal(),
    );
    return value === undefined ? 0n : BigInt(value as bigint | number);
  }

  /** The hash of the code a contract runs, in hex. */
  async wasmHash(contractId: string): Promise<string | null> {
    const { entries } = await this.server.getLedgerEntries(
      new Contract(contractId).getFootprint(),
    );
    const entry = entries[0]?.val;
    if (!entry) return null;
    const data = field<xdr.ContractDataEntry>(entry, 'contractData');
    const instance = field<xdr.ScContractInstance>(field(data, 'val'), 'instance');
    const executable = field<xdr.ContractExecutable>(instance, 'executable');
    // A Hash wrapper in some codec builds, raw bytes in others.
    const hash = field<{ value?: Uint8Array } | Uint8Array | undefined>(executable, 'wasmHash');
    if (!hash) return null;
    const bytes = hash instanceof Uint8Array ? hash : hash.value;
    return bytes ? Buffer.from(bytes).toString('hex') : null;
  }

  /** Whether a transaction made it into a ledger, and how it ended. */
  async transactionStatus(hash: string): Promise<ChainTxStatus> {
    const result = await this.server.getTransaction(hash);
    return result.status;
  }

  /**
   * Waits for a sent transaction to land. Returns NOT_FOUND when it has not
   * after the wait: the caller decides what an unknown outcome means.
   */
  async waitForTransaction(hash: string, timeoutMs = 30_000): Promise<ChainTxStatus> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const status = await this.transactionStatus(hash);
      if (status !== 'NOT_FOUND' || Date.now() >= deadline) return status;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }

  /** Runs a read-only contract call. Undefined when the contract is missing. */
  private async call(
    contractId: string,
    fn: string,
    ...args: xdr.ScVal[]
  ): Promise<unknown> {
    const tx = new TransactionBuilder(this.reader, {
      fee: '100',
      networkPassphrase: this.stellar.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(fn, ...args))
      .setTimeout(30)
      .build();
    const simulation = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulation)) {
      if (/MissingValue|non-existent contract|contract not found/i.test(simulation.error)) {
        return undefined;
      }
      throw new Error(`Could not read ${fn} of ${contractId}: ${simulation.error}`);
    }
    const retval = simulation.result?.retval;
    return retval ? scValToNative(retval) : undefined;
  }
}

/**
 * Reads a field of a decoded XDR value. The SDK's codec exposes fields as
 * properties while its type declarations describe methods, so accept either.
 */
function field<T>(value: unknown, name: string): T {
  const member = (value as Record<string, unknown>)[name];
  return (typeof member === 'function' ? (member as () => T).call(value) : member) as T;
}

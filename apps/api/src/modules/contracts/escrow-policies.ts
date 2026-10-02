import { POCKET_FEE_BASIS_POINTS, POCKET_FEE_PERCENT } from '@pocket/shared';
import { Address, hash, StrKey, xdr } from '@stellar/stellar-sdk';
import {
  expect,
  sameInteger,
  toStroops,
  type PlatformTxPolicy,
} from '../stellar/platform-tx-policy';

/**
 * The most the platform pays in fees for one escrow step: 2 XLM, about thirty
 * times what a deploy costs on testnet. A transaction asking for more is not a
 * fee, it is a drain.
 */
export const MAX_PLATFORM_FEE_STROOPS = 20_000_000;

/**
 * The `platform_fee` every Pocket escrow must store: Pocket's 1% in basis
 * points (hundredths of a percent), so 100. The V1 contract checks the fee
 * against a basis-point cap together with Trustless Work's 0.3% (30), which
 * is why this reads it in basis points.
 *
 * NOT CONFIRMED ON CHAIN YET. Confirm with a real testnet deploy read back from
 * the chain (`get_escrow`) before relying on it. A wrong unit fails closed: the
 * deploy policy refuses to sign and names the fee it found.
 */
export const POCKET_PLATFORM_FEE_ON_CHAIN = POCKET_FEE_BASIS_POINTS;

/**
 * What Pocket sends as `platformFee` in the body of Trustless Work's V1 deploy
 * endpoint. Trustless Work documents it as a percent that the API scales to
 * basis points (its V2 docs say so outright, and the API refuses fees over
 * "99%"), though some V1 examples send 100 or 200. Kept apart from the
 * on-chain value so that, if the API turns out to pass the number through
 * untouched, only this line changes.
 *
 * NOT CONFIRMED YET, like the on-chain value: confirm with a real testnet
 * deploy before the first hire that charges the fee.
 */
export const TW_API_PLATFORM_FEE = POCKET_FEE_PERCENT;

/** Addresses the platform's transactions are checked against. */
export interface PlatformAddresses {
  /** Pocket's own account: platform, release signer and dispute resolver. */
  platform: string;
  /** Trustless Work's contract that deploys escrows. */
  deployer: string;
  /** Where Trustless Work's protocol fee goes on this network. */
  twFee: string;
  /** The Stellar Asset Contract of USDC on this network. */
  usdcContract: string;
  /** The escrow code Trustless Work deploys, as a hex hash. */
  escrowWasmHash: string;
  /** The network the escrow is deployed on. */
  networkPassphrase: string;
}

/** A deploy policy that also knows where the escrow it allowed will live. */
export interface DeployPolicy extends PlatformTxPolicy {
  /**
   * The escrow's address, derived from the deployer and the salt of the
   * transaction that was checked. Pocket stores this one, never an address
   * someone reports back.
   */
  escrowAddress(): string;
}

/** A decoded bytes argument as a Buffer, or undefined when it is not bytes. */
function bytesOf(value: unknown): Buffer | undefined {
  return value instanceof Uint8Array ? Buffer.from(value) : undefined;
}

/** The address a contract gets when `deployer` deploys it with `salt`. */
export function contractAddressOf(
  deployer: string,
  salt: Buffer,
  networkPassphrase: string,
): string {
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(networkPassphrase)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: Address.fromString(deployer).toScAddress(),
          salt,
        }),
      ),
    }),
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

/** The escrow as the deploy call initialises it, decoded. */
interface DeployedEscrow {
  engagement_id?: unknown;
  platform_fee?: unknown;
  roles?: Record<string, unknown>;
  trustline?: { address?: unknown };
  milestones?: {
    amount?: unknown;
    receiver?: unknown;
    flags?: Record<string, unknown>;
  }[];
}

/**
 * Deploying an escrow: the call must create exactly the escrow Pocket asked
 * for. The roles and receivers are frozen once it is funded, so this is the
 * last moment to catch a wrong one.
 */
export function deployPolicy(
  addresses: PlatformAddresses,
  escrow: {
    contractId: string;
    startup: string;
    specialist: string;
    /** USDC per milestone, in milestone order. */
    milestoneAmounts: string[];
  },
): DeployPolicy {
  const { platform } = addresses;
  let escrowAddress: string | undefined;
  return {
    contractId: addresses.deployer,
    fn: 'tw_new_multi_release_escrow',
    maxFeeStroops: MAX_PLATFORM_FEE_STROOPS,
    escrowAddress: () => {
      if (!escrowAddress) throw new Error('The deploy was not checked yet');
      return escrowAddress;
    },
    checkArgs: (args) => {
      expect(args.length === 6, 'the deploy has an unexpected shape');
      expect(args[0] === platform, 'the deployer is not the platform');
      // The code is pinned: an escrow that runs anything else could ignore
      // its roles and hand the deposit to whoever wrote it.
      expect(
        bytesOf(args[1])?.toString('hex') === addresses.escrowWasmHash,
        "the escrow runs code other than Trustless Work's",
      );
      const salt = bytesOf(args[2]);
      expect(salt?.length === 32, 'the deploy has no salt');
      expect(args[3] === 'initialize_escrow', 'the deploy does not initialise an escrow');
      const inits = args[4];
      expect(Array.isArray(inits) && inits.length === 1, 'the deploy initialises something else');
      const deployed = inits[0] as DeployedEscrow;

      expect(
        deployed.engagement_id === escrow.contractId,
        'the escrow belongs to another contract',
      );
      const roles = deployed.roles ?? {};
      expect(roles.approver === escrow.startup, 'the approver is not the startup');
      expect(
        roles.service_provider === escrow.specialist,
        'the service provider is not the specialist',
      );
      expect(
        roles.platform === platform &&
          roles.release_signer === platform &&
          roles.dispute_resolver === platform,
        'a platform role is held by someone else',
      );
      // Pocket's fee, exactly: neither none nor more than Pocket charges.
      expect(
        sameInteger(deployed.platform_fee, POCKET_PLATFORM_FEE_ON_CHAIN),
        `the escrow's platform fee is ${String(deployed.platform_fee)}, not Pocket's ${POCKET_PLATFORM_FEE_ON_CHAIN}`,
      );
      expect(
        deployed.trustline?.address === addresses.usdcContract,
        'the escrow holds an asset other than USDC',
      );

      const milestones = deployed.milestones ?? [];
      expect(
        milestones.length === escrow.milestoneAmounts.length,
        'the escrow has other milestones',
      );
      milestones.forEach((milestone, index) => {
        expect(
          milestone.receiver === escrow.specialist,
          `milestone ${index} pays someone other than the specialist`,
        );
        expect(
          sameInteger(milestone.amount, toStroops(escrow.milestoneAmounts[index])),
          `milestone ${index} has another amount`,
        );
        const flags = milestone.flags ?? {};
        expect(
          !flags.approved && !flags.released && !flags.disputed && !flags.resolved,
          `milestone ${index} does not start untouched`,
        );
      });
      escrowAddress = contractAddressOf(addresses.deployer, salt, addresses.networkPassphrase);
    },
  };
}

/**
 * Releasing a milestone: that escrow, that milestone, fee to Trustless Work.
 * The call carries no amount: the contract pays the milestone's configured
 * amount, minus both fees, to the receiver fixed at deploy.
 */
export function releasePolicy(
  addresses: PlatformAddresses,
  escrowId: string,
  position: number,
): PlatformTxPolicy {
  return {
    contractId: escrowId,
    fn: 'release_milestone_funds',
    maxFeeStroops: MAX_PLATFORM_FEE_STROOPS,
    checkArgs: (args) => {
      expect(args.length === 3, 'the release has an unexpected shape');
      expect(args[0] === addresses.platform, 'the release signer is not the platform');
      expect(args[1] === addresses.twFee, 'the protocol fee goes to an unknown address');
      expect(sameInteger(args[2], position), 'the release is for another milestone');
    },
  };
}

/**
 * Resolving a dispute: the call names who gets paid, and the contract pays
 * whoever it names. Only the two parties, with exactly the amounts the
 * manager decided. Those are amounts before fees: the contract takes
 * Trustless Work's and Pocket's fee out of each share as it pays it, so the
 * call carries the gross shares and so does this check.
 */
export function resolvePolicy(
  addresses: PlatformAddresses,
  escrowId: string,
  position: number,
  payees: { address: string; amount: string }[],
): PlatformTxPolicy {
  return {
    contractId: escrowId,
    fn: 'resolve_milestone_dispute',
    maxFeeStroops: MAX_PLATFORM_FEE_STROOPS,
    checkArgs: (args) => {
      expect(args.length === 4, 'the resolution has an unexpected shape');
      expect(args[0] === addresses.platform, 'the dispute resolver is not the platform');
      expect(sameInteger(args[1], position), 'the resolution is for another milestone');
      expect(args[2] === addresses.twFee, 'the protocol fee goes to an unknown address');

      const distribution = args[3];
      expect(
        typeof distribution === 'object' && distribution !== null && !Array.isArray(distribution),
        'the resolution has no distribution',
      );
      const paid = Object.entries(distribution as Record<string, unknown>);
      expect(paid.length === payees.length, 'the resolution pays someone else');
      for (const payee of payees) {
        const amount = (distribution as Record<string, unknown>)[payee.address];
        expect(amount !== undefined, 'the resolution leaves out a party');
        expect(
          sameInteger(amount, toStroops(payee.amount)),
          'the resolution pays another amount',
        );
      }
    },
  };
}

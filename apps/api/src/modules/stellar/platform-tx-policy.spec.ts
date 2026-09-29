import {
  Account,
  Asset,
  Keypair,
  nativeToScVal,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import fixtures from './__fixtures__/platform-transactions.json';
import {
  assertPlatformTx,
  PlatformTxRefused,
  sameInteger,
  toStroops,
  type PlatformTxPolicy,
} from './platform-tx-policy';

const NETWORK = Networks.TESTNET;
const PLATFORM = 'GD6GR4SHFZENIND6EIU2M4MTWNNHOGL6JC6ZUYWBPVPQUG7XDXED3FNO';
const TW_FEE = 'GA6KH5VWPCHBOEF63X57SPX6T4H366YFFKKGCVDBTXT2N7JVL6PJCK7G';

/** A policy that accepts anything the contract and function allow. */
function open(contractId: string, fn: string): PlatformTxPolicy {
  return { contractId, fn, maxFeeStroops: 20_000_000, checkArgs: () => undefined };
}

describe('assertPlatformTx on the transactions Trustless Work really built', () => {
  it('accepts the real release of a milestone', () => {
    const { envelopeXdr, escrowId } = fixtures.release;
    const policy: PlatformTxPolicy = {
      ...open(escrowId, 'release_milestone_funds'),
      checkArgs: (args) => {
        expect(args[0]).toBe(PLATFORM);
        expect(args[1]).toBe(TW_FEE);
        expect(sameInteger(args[2], 0)).toBe(true);
      },
    };
    expect(() => assertPlatformTx(envelopeXdr, NETWORK, PLATFORM, policy)).not.toThrow();
  });

  it('accepts the real resolution and reads who gets paid', () => {
    const { envelopeXdr, escrowId, startup } = fixtures.resolve;
    let payees: unknown;
    const policy: PlatformTxPolicy = {
      ...open(escrowId, 'resolve_milestone_dispute'),
      checkArgs: (args) => {
        payees = args[3];
      },
    };
    assertPlatformTx(envelopeXdr, NETWORK, PLATFORM, policy);
    // The whole 60 USDC went back to the startup.
    expect(payees).toEqual({ [startup]: toStroops('60') });
  });

  it('accepts the real deploy and reads the escrow it creates', () => {
    const { envelopeXdr, contractId, specialist } = fixtures.deploy;
    let escrow: { engagement_id: string; roles: Record<string, string> } | undefined;
    const policy: PlatformTxPolicy = {
      ...open('CAZZOSFFNQQSDOLPPGN5BDITMNSLZITXW4S7V5ISM5EAB2THBD7F2AHR', 'tw_new_multi_release_escrow'),
      checkArgs: (args) => {
        [escrow] = args[4] as (typeof escrow)[];
      },
    };
    assertPlatformTx(envelopeXdr, NETWORK, PLATFORM, policy);
    expect(escrow?.engagement_id).toBe(contractId);
    expect(escrow?.roles.service_provider).toBe(specialist);
    expect(escrow?.roles.dispute_resolver).toBe(PLATFORM);
  });

  it('refuses the real release when its arguments are not what Pocket asked', () => {
    const { envelopeXdr, escrowId } = fixtures.release;
    const policy: PlatformTxPolicy = {
      ...open(escrowId, 'release_milestone_funds'),
      checkArgs: () => {
        throw new Error('the fee goes to an unknown address');
      },
    };
    expect(() => assertPlatformTx(envelopeXdr, NETWORK, PLATFORM, policy)).toThrow(
      'the fee goes to an unknown address',
    );
  });

  it('refuses a real transaction pointed at another escrow', () => {
    const { envelopeXdr } = fixtures.release;
    const other = fixtures.resolve.escrowId;
    expect(() =>
      assertPlatformTx(envelopeXdr, NETWORK, PLATFORM, open(other, 'release_milestone_funds')),
    ).toThrow('unexpected contract');
  });

  it('refuses a real transaction calling another function', () => {
    const { envelopeXdr, escrowId } = fixtures.release;
    expect(() =>
      assertPlatformTx(envelopeXdr, NETWORK, PLATFORM, open(escrowId, 'resolve_milestone_dispute')),
    ).toThrow('unexpected function');
  });
});

describe('assertPlatformTx against what an attacker could send', () => {
  const escrow = fixtures.release.escrowId;
  const policy = open(escrow, 'release_milestone_funds');
  const build = (op: xdrOperation, fee = '1000', source = PLATFORM) =>
    new TransactionBuilder(new Account(source, '1'), { fee, networkPassphrase: NETWORK })
      .addOperation(op)
      .setTimeout(300)
      .build()
      .toXDR();
  type xdrOperation = ReturnType<typeof Operation.payment>;
  const call = (fn: string) =>
    Operation.invokeContractFunction({
      contract: escrow,
      function: fn,
      args: [nativeToScVal(0, { type: 'u32' })],
    });

  it('accepts the expected call', () => {
    expect(() =>
      assertPlatformTx(build(call('release_milestone_funds')), NETWORK, PLATFORM, policy),
    ).not.toThrow();
  });

  it('refuses a payment that empties the account', () => {
    const pay = Operation.payment({
      destination: Keypair.random().publicKey(),
      asset: Asset.native(),
      amount: '9000',
    });
    expect(() => assertPlatformTx(build(pay), NETWORK, PLATFORM, policy)).toThrow(
      PlatformTxRefused,
    );
  });

  it('refuses a setOptions that hands the account to someone else', () => {
    const takeover = Operation.setOptions({
      signer: { ed25519PublicKey: Keypair.random().publicKey(), weight: 255 },
    });
    expect(() => assertPlatformTx(build(takeover), NETWORK, PLATFORM, policy)).toThrow(
      'unexpected operation setOptions',
    );
  });

  it('refuses a fee that burns the balance', () => {
    expect(() =>
      assertPlatformTx(
        build(call('release_milestone_funds'), '900000000'),
        NETWORK,
        PLATFORM,
        policy,
      ),
    ).toThrow('too high');
  });

  it('refuses a transaction from another account', () => {
    const stranger = Keypair.random().publicKey();
    expect(() =>
      assertPlatformTx(build(call('release_milestone_funds'), '1000', stranger), NETWORK, PLATFORM, policy),
    ).toThrow('source is not the platform');
  });

  it('refuses a call wrapped with a second operation', () => {
    const xdr = new TransactionBuilder(new Account(PLATFORM, '1'), {
      fee: '1000',
      networkPassphrase: NETWORK,
    })
      .addOperation(call('release_milestone_funds'))
      .addOperation(Operation.bumpSequence({ bumpTo: '100' }))
      .setTimeout(300)
      .build()
      .toXDR();
    expect(() => assertPlatformTx(xdr, NETWORK, PLATFORM, policy)).toThrow(
      'exactly one operation',
    );
  });
});

describe('toStroops', () => {
  it.each([
    ['60', 600_000_000n],
    ['0.3', 3_000_000n],
    ['1.2345678', 12_345_678n],
    ['150', 1_500_000_000n],
  ])('reads %s USDC as %s stroops', (amount, stroops) => {
    expect(toStroops(amount)).toBe(stroops);
  });
});

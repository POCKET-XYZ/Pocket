import { Networks, scValToNative, xdr } from '@stellar/stellar-sdk';
import fixtures from '../stellar/__fixtures__/platform-transactions.json';
import { assertPlatformTx } from '../stellar/platform-tx-policy';
import {
  deployPolicy,
  POCKET_PLATFORM_FEE_ON_CHAIN,
  releasePolicy,
  resolvePolicy,
  type PlatformAddresses,
} from './escrow-policies';

const ADDRESSES: PlatformAddresses = {
  platform: 'GD6GR4SHFZENIND6EIU2M4MTWNNHOGL6JC6ZUYWBPVPQUG7XDXED3FNO',
  deployer: 'CAZZOSFFNQQSDOLPPGN5BDITMNSLZITXW4S7V5ISM5EAB2THBD7F2AHR',
  twFee: 'GA6KH5VWPCHBOEF63X57SPX6T4H366YFFKKGCVDBTXT2N7JVL6PJCK7G',
  usdcContract: fixtures.usdcContractId,
  escrowWasmHash: '5618791548edfc44074e4b79e5d1b29f5712ff98eead12d22fb4d7f04d4edbf2',
  networkPassphrase: Networks.TESTNET,
};
const STRANGER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const sign = (envelope: string, policy: ReturnType<typeof releasePolicy>) =>
  assertPlatformTx(envelope, Networks.TESTNET, ADDRESSES.platform, policy);

/** Reads a field of a decoded XDR value, a property in this codec build. */
const at = <T>(value: unknown, name: string): T => {
  const member = (value as Record<string, unknown>)[name];
  return (typeof member === 'function' ? (member as () => T).call(value) : member) as T;
};

/** The contract call inside a real envelope, to edit its arguments. */
function callOf(envelope: xdr.TransactionEnvelope): { args: xdr.ScVal[] } {
  const tx = at<unknown>(at<unknown>(envelope, 'v1'), 'tx');
  const [operation] = at<unknown[]>(tx, 'operations');
  const invoke = at<unknown>(at<unknown>(operation, 'body'), 'invokeHostFunctionOp');
  return at<{ args: xdr.ScVal[] }>(at<unknown>(invoke, 'hostFunction'), 'invokeContract');
}

/** A real envelope with its call arguments changed by `edit`. */
function rewrite(envelopeXdr: string, edit: (args: xdr.ScVal[]) => xdr.ScVal[]): string {
  const envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');
  const call = callOf(envelope);
  call.args = edit(at<xdr.ScVal[]>(call, 'args'));
  return envelope.toXDR('base64');
}

/**
 * The real deploy with another platform fee. The recorded deploy predates
 * Pocket's fee and sets 0; this is the same transaction setting `fee`.
 */
function deployWithFee(fee: number): string {
  return rewrite(fixtures.deploy.envelopeXdr, (args) => {
    const [escrow] = at<xdr.ScVal[]>(args[4], 'vec');
    const entry = at<xdr.ScMapEntry[]>(escrow, 'map').find(
      (candidate) => scValToNative(at<xdr.ScVal>(candidate, 'key')) === 'platform_fee',
    );
    (entry as unknown as { val: xdr.ScVal }).val = xdr.ScVal.scvU32(fee);
    return args;
  });
}

const deployOf = (addresses: PlatformAddresses = ADDRESSES) =>
  deployPolicy(addresses, {
    contractId: fixtures.deploy.contractId,
    startup: fixtures.deploy.startup,
    specialist: fixtures.deploy.specialist,
    milestoneAmounts: fixtures.deploy.milestones.map((m) => m.amount),
  });

describe('the escrow policies accept what Trustless Work really built', () => {
  it("the deploy of a real contract, with Pocket's 1% fee", () => {
    const policy = deployOf();
    expect(POCKET_PLATFORM_FEE_ON_CHAIN).toBe(100);
    expect(() => sign(deployWithFee(100), policy)).not.toThrow();
    // The address comes from the deployer and the salt: the real escrow's.
    expect(policy.escrowAddress()).toBe(fixtures.deploy.escrowId);
  });

  it('the release of a real milestone', () => {
    const r = fixtures.release;
    expect(() =>
      sign(r.envelopeXdr, releasePolicy(ADDRESSES, r.escrowId, r.milestonePosition ?? 0)),
    ).not.toThrow();
  });

  it('the resolution of a real dispute', () => {
    const r = fixtures.resolve;
    const policy = resolvePolicy(ADDRESSES, r.escrowId, r.milestonePosition ?? 0, [
      { address: r.startup, amount: '60' },
    ]);
    expect(() => sign(r.envelopeXdr, policy)).not.toThrow();
  });
});

describe('the escrow policies refuse a real transaction that is not what Pocket asked', () => {
  it.each([
    ['no fee', 0],
    ['2%', 200],
    ['0.01%', 1],
  ])("a deploy that charges %s instead of Pocket's 1%", (_label, fee) => {
    expect(() => sign(deployWithFee(fee), deployOf())).toThrow(
      `the escrow's platform fee is ${fee}, not Pocket's 100`,
    );
  });

  it('the recorded deploy, which charges no fee', () => {
    expect(() => sign(fixtures.deploy.envelopeXdr, deployOf())).toThrow(
      "the escrow's platform fee is 0",
    );
  });

  it('a deploy for another contract', () => {
    const d = fixtures.deploy;
    const policy = deployPolicy(ADDRESSES, {
      contractId: 'another-contract',
      startup: d.startup,
      specialist: d.specialist,
      milestoneAmounts: d.milestones.map((m) => m.amount),
    });
    expect(() => sign(deployWithFee(100), policy)).toThrow('belongs to another contract');
  });

  it('a deploy that pays another specialist', () => {
    const d = fixtures.deploy;
    const policy = deployPolicy(ADDRESSES, {
      contractId: d.contractId,
      startup: d.startup,
      specialist: STRANGER,
      milestoneAmounts: d.milestones.map((m) => m.amount),
    });
    expect(() => sign(deployWithFee(100), policy)).toThrow('service provider');
  });

  it('a deploy of other code', () => {
    const d = fixtures.deploy;
    const policy = deployPolicy(
      { ...ADDRESSES, escrowWasmHash: 'cd'.repeat(32) },
      {
        contractId: d.contractId,
        startup: d.startup,
        specialist: d.specialist,
        milestoneAmounts: d.milestones.map((m) => m.amount),
      },
    );
    expect(() => sign(deployWithFee(100), policy)).toThrow('code other than');
  });

  it('a deploy with other amounts', () => {
    const d = fixtures.deploy;
    const policy = deployPolicy(ADDRESSES, {
      contractId: d.contractId,
      startup: d.startup,
      specialist: d.specialist,
      milestoneAmounts: ['1'],
    });
    expect(() => sign(deployWithFee(100), policy)).toThrow('another amount');
  });

  it('a deploy of an escrow in another asset', () => {
    const d = fixtures.deploy;
    const policy = deployPolicy(
      { ...ADDRESSES, usdcContract: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' },
      {
        contractId: d.contractId,
        startup: d.startup,
        specialist: d.specialist,
        milestoneAmounts: d.milestones.map((m) => m.amount),
      },
    );
    expect(() => sign(deployWithFee(100), policy)).toThrow('other than USDC');
  });

  it('a release whose protocol fee goes to a stranger', () => {
    const r = fixtures.release;
    const policy = releasePolicy({ ...ADDRESSES, twFee: STRANGER }, r.escrowId, 0);
    expect(() => sign(r.envelopeXdr, policy)).toThrow('unknown address');
  });

  it('a release of another milestone', () => {
    const r = fixtures.release;
    expect(() => sign(r.envelopeXdr, releasePolicy(ADDRESSES, r.escrowId, 1))).toThrow(
      'another milestone',
    );
  });

  it('a resolution that pays someone other than the parties', () => {
    const r = fixtures.resolve;
    // Pocket asked to pay the specialist; the transaction pays the startup.
    const policy = resolvePolicy(ADDRESSES, r.escrowId, 0, [
      { address: r.specialist, amount: '60' },
    ]);
    expect(() => sign(r.envelopeXdr, policy)).toThrow('leaves out a party');
  });

  it('a resolution that pays another amount', () => {
    const r = fixtures.resolve;
    const policy = resolvePolicy(ADDRESSES, r.escrowId, 0, [
      { address: r.startup, amount: '59' },
    ]);
    expect(() => sign(r.envelopeXdr, policy)).toThrow('another amount');
  });

  it('a resolution that adds a payee', () => {
    const r = fixtures.resolve;
    const policy = resolvePolicy(ADDRESSES, r.escrowId, 0, [
      { address: r.startup, amount: '60' },
      { address: r.specialist, amount: '0.1' },
    ]);
    expect(() => sign(r.envelopeXdr, policy)).toThrow('pays someone else');
  });
});

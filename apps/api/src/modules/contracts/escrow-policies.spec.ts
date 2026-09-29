import { Networks } from '@stellar/stellar-sdk';
import fixtures from '../stellar/__fixtures__/platform-transactions.json';
import { assertPlatformTx } from '../stellar/platform-tx-policy';
import {
  deployPolicy,
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
const sign = (xdr: string, policy: ReturnType<typeof releasePolicy>) =>
  assertPlatformTx(xdr, Networks.TESTNET, ADDRESSES.platform, policy);

describe('the escrow policies accept what Trustless Work really built', () => {
  it('the deploy of a real contract', () => {
    const d = fixtures.deploy;
    const policy = deployPolicy(ADDRESSES, {
      contractId: d.contractId,
      startup: d.startup,
      specialist: d.specialist,
      milestoneAmounts: d.milestones.map((m) => m.amount),
    });
    expect(() => sign(d.envelopeXdr, policy)).not.toThrow();
    // The address comes from the deployer and the salt: the real escrow's.
    expect(policy.escrowAddress()).toBe(d.escrowId);
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
  it('a deploy for another contract', () => {
    const d = fixtures.deploy;
    const policy = deployPolicy(ADDRESSES, {
      contractId: 'another-contract',
      startup: d.startup,
      specialist: d.specialist,
      milestoneAmounts: d.milestones.map((m) => m.amount),
    });
    expect(() => sign(d.envelopeXdr, policy)).toThrow('belongs to another contract');
  });

  it('a deploy that pays another specialist', () => {
    const d = fixtures.deploy;
    const policy = deployPolicy(ADDRESSES, {
      contractId: d.contractId,
      startup: d.startup,
      specialist: STRANGER,
      milestoneAmounts: d.milestones.map((m) => m.amount),
    });
    expect(() => sign(d.envelopeXdr, policy)).toThrow('service provider');
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
    expect(() => sign(d.envelopeXdr, policy)).toThrow('code other than');
  });

  it('a deploy with other amounts', () => {
    const d = fixtures.deploy;
    const policy = deployPolicy(ADDRESSES, {
      contractId: d.contractId,
      startup: d.startup,
      specialist: d.specialist,
      milestoneAmounts: ['1'],
    });
    expect(() => sign(d.envelopeXdr, policy)).toThrow('another amount');
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
    expect(() => sign(d.envelopeXdr, policy)).toThrow('other than USDC');
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

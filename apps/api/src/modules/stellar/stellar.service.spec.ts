import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  Account,
  Address,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import * as securityLog from '../../common/security/security-log';
import type { PlatformTxPolicy } from './platform-tx-policy';
import { StellarService } from './stellar.service';

const PLATFORM = Keypair.random();
const USER = Keypair.random();
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

function service(): StellarService {
  const values: Record<string, string> = {
    'stellar.network': 'testnet',
    'stellar.usdcIssuer': USDC_ISSUER,
    'stellar.platformSecret': PLATFORM.secret(),
    'stellar.horizonUrl': 'https://horizon-testnet.stellar.org',
  };
  return new StellarService({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService);
}

/** A transaction shaped like the ones Trustless Work prepares for a user. */
function userTransaction() {
  return new TransactionBuilder(new Account(USER.publicKey(), '41'), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.bumpSequence({ bumpTo: '42', source: USER.publicKey() }),
    )
    .setTimeout(300)
    .build();
}

describe('StellarService.hashOf', () => {
  it('hashes a transaction the same before and after it is signed', () => {
    const stellar = service();
    const tx = userTransaction();
    const unsigned = tx.toXDR();
    tx.sign(USER);

    expect(stellar.hashOf(tx.toXDR())).toBe(stellar.hashOf(unsigned));
  });

  it('reads the inner transaction of a fee bump', () => {
    // A wallet that sponsors fees, like Pollar, returns the signed transaction
    // wrapped in a fee bump paid by its own account. The operation Pocket
    // prepared is the one inside, and that is the hash it was recorded under.
    const stellar = service();
    const inner = userTransaction();
    const innerHash = stellar.hashOf(inner.toXDR());
    inner.sign(USER);

    const bump = TransactionBuilder.buildFeeBumpTransaction(
      PLATFORM,
      (Number(BASE_FEE) * 2).toString(),
      inner,
      Networks.TESTNET,
    );
    bump.sign(PLATFORM);

    expect(stellar.hashOf(bump.toXDR())).toBe(innerHash);
  });
});

describe('StellarService.buildUsdcPayment', () => {
  const FRIEND = Keypair.random().publicKey();

  function withAccount(): StellarService {
    const stellar = service();
    // Horizon is not called in tests: the account comes from here.
    (stellar as unknown as { horizon: { loadAccount: () => Promise<Account> } }).horizon = {
      loadAccount: () => Promise.resolve(new Account(USER.publicKey(), '41')),
    };
    return stellar;
  }

  it('builds one USDC payment from the user, with the memo, that expires', async () => {
    const stellar = withAccount();
    const tx = stellar.parse(
      await stellar.buildUsdcPayment(USER.publicKey(), FRIEND, '12.5000000', 'invoice 42'),
    );

    expect(tx.source).toBe(USER.publicKey());
    expect(tx.operations).toHaveLength(1);
    const [op] = tx.operations;
    expect(op.type).toBe('payment');
    if (op.type !== 'payment') return;
    expect(op.destination).toBe(FRIEND);
    expect(op.amount).toBe('12.5000000');
    expect(op.asset.getCode()).toBe('USDC');
    expect(op.asset.getIssuer()).toBe(USDC_ISSUER);
    expect(op.source).toBeUndefined();
    expect(tx.memo.type).toBe('text');
    // A parsed text memo comes back as its bytes.
    expect(Buffer.from(tx.memo.value as Uint8Array).toString('utf8')).toBe('invoice 42');
    expect(Number(tx.timeBounds?.maxTime)).toBeGreaterThan(Date.now() / 1000);
  });

  it('leaves the memo out when there is none', async () => {
    const stellar = withAccount();
    const tx = stellar.parse(await stellar.buildUsdcPayment(USER.publicKey(), FRIEND, '1'));
    expect(tx.memo.type).toBe('none');
  });
});

describe('StellarService.signAsPlatform', () => {
  const DEPLOYER = 'CB2HSK3BTB5LCNDZNBMHELPI3DLS724GKFVFQQOXZBOYU2CIPAR5QDMD';
  const POLICY: PlatformTxPolicy = {
    contractId: DEPLOYER,
    fn: 'tw_new_multi_release_escrow',
    maxFeeStroops: 20_000_000,
    checkArgs: () => undefined,
  };
  let alerts: jest.SpyInstance;

  /** A platform call to the deployer, asking for this fee in stroops. */
  function deploy(fee: string): string {
    return new TransactionBuilder(new Account(PLATFORM.publicKey(), '1'), {
      fee,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: DEPLOYER,
          function: 'tw_new_multi_release_escrow',
          args: [new Address(PLATFORM.publicKey()).toScVal()],
        }),
      )
      .setTimeout(60)
      .build()
      .toXDR();
  }

  beforeEach(() => {
    alerts = jest.spyOn(securityLog, 'securityEvent').mockImplementation(() => undefined);
  });

  afterEach(() => alerts.mockRestore());

  it('signs a transaction the policy allows', () => {
    const signed = service().signAsPlatform(deploy('100000'), POLICY);
    expect(TransactionBuilder.fromXDR(signed, Networks.TESTNET).signatures).toHaveLength(1);
    expect(alerts).not.toHaveBeenCalled();
  });

  it('tells the user the step is paused, and the alert why', () => {
    // 33.5 XLM, what Trustless Work's mainnet deploy asked while its code was archived.
    let thrown: unknown;
    try {
      service().signAsPlatform(deploy('335226754'), POLICY);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect((thrown as Error).message).toMatch(/Nothing was signed and no money moved/);
    expect((thrown as Error).message).not.toMatch(/XLM/);
    expect(alerts).toHaveBeenCalledWith(
      'platform_refused',
      expect.objectContaining({
        reason: expect.stringContaining('the fee of 33.5227 XLM is too high (limit 2 XLM)'),
      }),
      'alert',
    );
  });
});

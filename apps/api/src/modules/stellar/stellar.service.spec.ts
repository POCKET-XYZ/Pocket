import type { ConfigService } from '@nestjs/config';
import {
  Account,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
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

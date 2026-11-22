import type { ConfigService } from '@nestjs/config';
import { Keypair, Networks } from '@stellar/stellar-sdk';
import { SorobanReader } from './soroban-reader.service';
import type { StellarService } from './stellar.service';

describe('SorobanReader', () => {
  let reader: SorobanReader;
  let simulate: jest.Mock;
  let ledgerEntries: jest.Mock;

  beforeEach(() => {
    const config = { getOrThrow: () => 'https://soroban.example' };
    const stellar = {
      platformAddress: Keypair.random().publicKey(),
      networkPassphrase: Networks.TESTNET,
    };
    reader = new SorobanReader(
      config as unknown as ConfigService,
      stellar as unknown as StellarService,
    );
    simulate = jest.fn();
    ledgerEntries = jest.fn();
    // The RPC node is never reached in these tests.
    (reader as unknown as { server: object }).server = {
      simulateTransaction: simulate,
      getLedgerEntries: ledgerEntries,
    };
  });

  it.each([
    [
      'a contract id with a bad checksum',
      'CDGPEW77X2GQJMLLCARQDTHBIH4YKT5KT2SW2IFYIC57OV6PFKFRQ2O5',
    ],
    ['an account address', Keypair.random().publicKey()],
    ['an empty value', ''],
  ])('reads %s as no escrow, without asking the network', async (_label, id) => {
    await expect(reader.escrow(id)).resolves.toBeNull();
    await expect(reader.wasmHash(id)).resolves.toBeNull();
    expect(simulate).not.toHaveBeenCalled();
    expect(ledgerEntries).not.toHaveBeenCalled();
  });
});

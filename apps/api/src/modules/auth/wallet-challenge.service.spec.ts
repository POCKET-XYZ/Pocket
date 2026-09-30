import { ConfigService } from '@nestjs/config';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import type { PrismaService } from '../../prisma/prisma.service';
import { WalletChallengeService } from './wallet-challenge.service';

type Challenge = { stellarAddress: string; nonce: string; expiresAt: Date };

/** Minimal in-memory stand-in for the authChallenge table, keyed by nonce. */
function fakePrisma() {
  const rows = new Map<string, Challenge>();
  const authChallenge = {
    create: jest.fn(async ({ data }: { data: Challenge }) => {
      rows.set(data.nonce, data);
      return data;
    }),
    findUnique: jest.fn(
      async ({ where }: { where: { nonce: string } }) => rows.get(where.nonce) ?? null,
    ),
    deleteMany: jest.fn(
      async ({
        where,
      }: {
        where: { stellarAddress?: string; nonce?: string; expiresAt?: { lt: Date } };
      }) => {
        let count = 0;
        for (const [nonce, row] of rows) {
          const expired = where.expiresAt ? row.expiresAt < where.expiresAt.lt : true;
          const matches =
            (where.nonce === undefined || where.nonce === nonce) &&
            (where.stellarAddress === undefined || where.stellarAddress === row.stellarAddress);
          if (expired && matches) {
            rows.delete(nonce);
            count++;
          }
        }
        return { count };
      },
    ),
  };
  return {
    rows,
    authChallenge,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

/** The nonce a signed challenge carries. */
function nonceOf(signedXdr: string): string {
  const tx = TransactionBuilder.fromXDR(signedXdr, 'Test SDF Network ; September 2015');
  const [op] = (tx as { operations: { value?: Buffer }[] }).operations;
  return Buffer.from(op.value as Buffer).toString('utf8');
}

describe('WalletChallengeService', () => {
  const config = new ConfigService({ stellar: { network: 'testnet' } });
  let prisma: ReturnType<typeof fakePrisma>;
  let service: WalletChallengeService;

  beforeEach(() => {
    prisma = fakePrisma();
    service = new WalletChallengeService(prisma as unknown as PrismaService, config);
  });

  async function signedChallenge(signer: Keypair, address = signer.publicKey()) {
    const { xdr, networkPassphrase } = await service.issue(address);
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    tx.sign(signer);
    return tx.toXDR();
  }

  it('rejects an invalid stellar address', async () => {
    await expect(service.issue('not-an-address')).rejects.toThrow(
      'Invalid Stellar address',
    );
  });

  it('issues a zero fee challenge for the address', async () => {
    const wallet = Keypair.random();
    const { xdr, networkPassphrase } = await service.issue(wallet.publicKey());
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    expect(tx.fee).toBe('0');
    expect([...prisma.rows.values()].some((row) => row.stellarAddress === wallet.publicKey())).toBe(true);
  });

  it('accepts a challenge signed by the address owner', async () => {
    const wallet = Keypair.random();
    const signed = await signedChallenge(wallet);
    await expect(service.verify(wallet.publicKey(), signed)).resolves.toBe(nonceOf(signed));
  });

  it('rejects a challenge signed by another key', async () => {
    const wallet = Keypair.random();
    const signed = await signedChallenge(Keypair.random(), wallet.publicKey());
    await expect(service.verify(wallet.publicKey(), signed)).resolves.toBeNull();
  });

  it('rejects an expired challenge', async () => {
    const wallet = Keypair.random();
    const signed = await signedChallenge(wallet);
    const row = prisma.rows.get(nonceOf(signed));
    if (row) row.expiresAt = new Date(Date.now() - 1000);
    await expect(service.verify(wallet.publicKey(), signed)).resolves.toBeNull();
  });

  it('rejects a reused challenge after it is consumed', async () => {
    const wallet = Keypair.random();
    const signed = await signedChallenge(wallet);
    await service.consume(wallet.publicKey(), nonceOf(signed));
    await expect(service.verify(wallet.publicKey(), signed)).resolves.toBeNull();
  });

  it('keeps a challenge valid when someone asks for another in the same name', async () => {
    // Asking for challenges in a victim's name used to replace theirs and lock
    // them out. Now each challenge stands on its own.
    const victim = Keypair.random();
    const signed = await signedChallenge(victim);
    await service.issue(victim.publicKey());
    await service.issue(victim.publicKey());
    await expect(service.verify(victim.publicKey(), signed)).resolves.toBe(nonceOf(signed));
  });

  it('lets only one login use a challenge', async () => {
    const wallet = Keypair.random();
    const nonce = nonceOf(await signedChallenge(wallet));
    const [first, second] = await Promise.all([
      service.consume(wallet.publicKey(), nonce),
      service.consume(wallet.publicKey(), nonce),
    ]);
    expect([first, second].sort()).toEqual([false, true]);
  });

  it('refuses a challenge issued to another address', async () => {
    const owner = Keypair.random();
    const other = Keypair.random();
    // A challenge issued to `owner`, rebuilt as if `other` answered it.
    const { xdr, networkPassphrase } = await service.issue(owner.publicKey());
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    tx.sign(other);
    await expect(service.verify(other.publicKey(), tx.toXDR())).resolves.toBeNull();
  });

  it('rejects garbage xdr', async () => {
    const wallet = Keypair.random();
    await service.issue(wallet.publicKey());
    await expect(service.verify(wallet.publicKey(), 'AAAA')).resolves.toBeNull();
  });
});

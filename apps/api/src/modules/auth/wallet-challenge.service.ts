import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Account,
  type FeeBumpTransaction,
  Keypair,
  Networks,
  Operation,
  type Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const CHALLENGE_TTL_SECONDS = 5 * 60;
export const CHALLENGE_DATA_NAME = 'Pocket auth';

/**
 * SEP-10 style wallet login. The server hands out an unsigned transaction that
 * carries a one-time nonce; the user's own wallet (Stellar Wallets Kit) signs it
 * and the signature proves control of the address. The transaction is never
 * submitted to the network, so signing it costs nothing.
 */
@Injectable()
export class WalletChallengeService {
  readonly networkPassphrase: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.networkPassphrase =
      config.get<string>('stellar.network') === 'mainnet'
        ? Networks.PUBLIC
        : Networks.TESTNET;
  }

  async issue(
    stellarAddress: string,
  ): Promise<{ xdr: string; networkPassphrase: string }> {
    if (!isValidPublicKey(stellarAddress)) {
      throw new BadRequestException('Invalid Stellar address');
    }

    const nonce = randomBytes(24).toString('hex');
    const tx = new TransactionBuilder(new Account(stellarAddress, '0'), {
      // Zero fee: the wallet shows "0 XLM" and the network would reject the
      // transaction if anyone ever tried to broadcast it.
      fee: '0',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.manageData({ name: CHALLENGE_DATA_NAME, value: nonce }))
      .setTimeout(CHALLENGE_TTL_SECONDS)
      .build();

    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);
    await this.prisma.$transaction([
      // Housekeeping: an expired challenge can never be used.
      this.prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      this.prisma.authChallenge.create({ data: { stellarAddress, nonce, expiresAt } }),
    ]);

    return { xdr: tx.toXDR(), networkPassphrase: this.networkPassphrase };
  }

  /**
   * The nonce of the challenge `signedXdr` answers, when it is one Pocket
   * issued to this address, still open, and signed by the address's key;
   * otherwise null. It does not use the challenge up: `consume` does that.
   */
  async verify(stellarAddress: string, signedXdr: string): Promise<string | null> {
    let tx: Transaction | FeeBumpTransaction;
    try {
      tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    } catch {
      return null;
    }

    if ('innerTransaction' in tx) return null;
    if (tx.source !== stellarAddress || tx.operations.length !== 1) return null;
    const [op] = tx.operations;
    if (op.type !== 'manageData' || op.name !== CHALLENGE_DATA_NAME || !op.value) {
      return null;
    }

    const nonce = Buffer.from(op.value).toString('utf8');
    const challenge = await this.prisma.authChallenge.findUnique({ where: { nonce } });
    if (
      !challenge ||
      challenge.stellarAddress !== stellarAddress ||
      challenge.expiresAt.getTime() < Date.now()
    ) {
      return null;
    }

    const keypair = Keypair.fromPublicKey(stellarAddress);
    const hash = tx.hash();
    const signed = tx.signatures.some((sig) => {
      try {
        return keypair.verify(hash, sig.signature);
      } catch {
        return false;
      }
    });
    return signed ? nonce : null;
  }

  /**
   * Use the challenge up, atomically: of two logins racing with the same
   * signature, exactly one gets true, so a captured signature cannot be
   * replayed.
   */
  async consume(stellarAddress: string, nonce: string): Promise<boolean> {
    const { count } = await this.prisma.authChallenge.deleteMany({
      where: { stellarAddress, nonce },
    });
    return count === 1;
  }
}

function isValidPublicKey(address: string): boolean {
  try {
    Keypair.fromPublicKey(address);
    return true;
  } catch {
    return false;
  }
}

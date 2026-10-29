import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UsdcPaymentRecord } from '@pocket/shared';
import { StrKey } from '@stellar/stellar-sdk';
import type { AuthUser } from '../../common/types/auth';
import {
  ChainOperationsService,
  type PreparedTransaction,
} from './chain-operations.service';
import { StellarService, type UsdcReadiness } from './stellar.service';

/** The longest text memo Stellar takes, in bytes. */
export const MAX_MEMO_BYTES = 28;

/** How many payments the wallet page lists. */
const HISTORY_SIZE = 20;

/** A payment the user asked for, as the client sends it. */
export interface UsdcPaymentRequest {
  destination: string;
  amount: string;
  memo?: string;
}

/**
 * Helps a wallet get ready for USDC. Before a specialist can be paid, and
 * before a startup can fund an escrow, their wallet has to trust the USDC
 * asset: a one-time signature. Also sends USDC from the wallet to another
 * address, and lists what came in and went out.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly stellar: StellarService,
    private readonly operations: ChainOperationsService,
  ) {}

  /**
   * What the wallet still needs before it can take part in an escrow: trusting
   * USDC, and some XLM to pay the network fee of each step it signs. Also the
   * USDC it can send.
   */
  async usdcStatus(user: AuthUser): Promise<{
    address: string;
    usdc: UsdcReadiness;
    xlmForFees: string | null;
    usdcSpendable: string | null;
  }> {
    const [usdc, xlmForFees, usdcSpendable] = await Promise.all([
      this.stellar.usdcReadiness(user.stellarAddress),
      this.stellar.spendableXlm(user.stellarAddress),
      this.stellar.spendableUsdc(user.stellarAddress),
    ]);
    return { address: user.stellarAddress, usdc, xlmForFees, usdcSpendable };
  }

  async prepareTrustline(user: AuthUser): Promise<PreparedTransaction> {
    const readiness = await this.stellar.usdcReadiness(user.stellarAddress);
    if (readiness === 'ready') {
      throw new BadRequestException('Tu wallet ya tiene USDC habilitado');
    }
    if (readiness === 'no_account') {
      throw new BadRequestException(
        'Tu wallet todavía no está activa en Stellar. Primero agrégale algo de XLM',
      );
    }
    const xdr = await this.stellar.buildUsdcTrustline(user.stellarAddress);
    return this.operations.prepare({ kind: 'trustline' }, xdr, user.sub);
  }

  async submitTrustline(user: AuthUser, signedXdr: string) {
    const operation = await this.operations.submitSigned(
      { kind: 'trustline' },
      signedXdr,
      user.sub,
    );
    return {
      txHash: operation.txHash,
      usdc: await this.stellar.usdcReadiness(user.stellarAddress),
    };
  }

  /**
   * A USDC payment from the user's wallet for them to sign. Everything that
   * would make the network refuse it, or lose the money, is checked first: a
   * real account that trusts USDC, not their own, and an amount they have.
   */
  async preparePayment(
    user: AuthUser,
    request: UsdcPaymentRequest,
  ): Promise<PreparedTransaction> {
    const { destination } = request;
    const amount = paymentAmount(request.amount);
    const memo = request.memo === '' ? undefined : request.memo;

    if (!StrKey.isValidEd25519PublicKey(destination)) {
      throw new BadRequestException('Esa no es una dirección de Stellar válida');
    }
    if (destination === user.stellarAddress) {
      throw new BadRequestException('Esa es tu propia dirección. Ingresa la dirección a la que quieres pagar');
    }
    if (memo !== undefined && Buffer.byteLength(memo, 'utf8') > MAX_MEMO_BYTES) {
      throw new BadRequestException(`El memo puede tener como máximo ${MAX_MEMO_BYTES} bytes`);
    }

    const [spendable, recipient] = await Promise.all([
      this.stellar.spendableUsdc(user.stellarAddress),
      this.stellar.usdcReadiness(destination),
    ]);
    if (spendable === null) {
      throw new BadRequestException('Tu wallet todavía no tiene USDC');
    }
    if (amount.greaterThan(spendable)) {
      throw new BadRequestException(`Puedes enviar como máximo ${spendable} USDC`);
    }
    if (recipient === 'no_account') {
      throw new BadRequestException(
        'Esa dirección todavía no existe en Stellar. Revísala o pídele a su dueño que la active',
      );
    }
    if (recipient === 'no_trustline') {
      throw new BadRequestException(
        'Esa dirección todavía no acepta USDC. Primero su dueño tiene que habilitar USDC',
      );
    }

    const xdr = await this.stellar.buildUsdcPayment(
      user.stellarAddress,
      destination,
      amount.toFixed(7),
      memo,
    );
    return this.operations.prepare({ kind: 'payment' }, xdr, user.sub, amount);
  }

  /**
   * Broadcast a payment the user signed. Only the exact transaction prepared
   * for them is accepted, so its destination, amount and memo are the ones
   * checked when it was prepared.
   */
  async submitPayment(
    user: AuthUser,
    signedXdr: string,
  ): Promise<{ txHash: string; amount: string; destination: string }> {
    const operation = await this.operations.submitSigned(
      { kind: 'payment' },
      signedXdr,
      user.sub,
    );
    const [payment] = this.stellar.parse(signedXdr).operations;
    if (payment?.type !== 'payment') {
      // Cannot happen: only the prepared payment gets this far.
      throw new BadRequestException('Esta transacción no es un pago');
    }
    return { txHash: operation.txHash, amount: payment.amount, destination: payment.destination };
  }

  /** The latest USDC in and out of the user's wallet. */
  payments(user: AuthUser): Promise<UsdcPaymentRecord[]> {
    return this.stellar.usdcPayments(user.stellarAddress, HISTORY_SIZE);
  }
}

/** A positive amount with at most 7 decimals, as the network counts USDC. */
function paymentAmount(value: string): Prisma.Decimal {
  if (!/^\d{1,12}(\.\d{1,7})?$/.test(value)) {
    throw new BadRequestException('Ingresa un monto con 7 decimales como máximo');
  }
  const amount = new Prisma.Decimal(value);
  if (amount.lessThanOrEqualTo(0)) {
    throw new BadRequestException('El monto tiene que ser mayor que cero');
  }
  return amount;
}

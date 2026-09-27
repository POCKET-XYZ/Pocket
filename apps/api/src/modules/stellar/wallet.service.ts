import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth';
import {
  ChainOperationsService,
  type PreparedTransaction,
} from './chain-operations.service';
import { StellarService, type UsdcReadiness } from './stellar.service';

/**
 * Helps a wallet get ready for USDC. Before a specialist can be paid, and
 * before a startup can fund an escrow, their wallet has to trust the USDC
 * asset: a one-time signature.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly stellar: StellarService,
    private readonly operations: ChainOperationsService,
  ) {}

  /**
   * What the wallet still needs before it can take part in an escrow: trusting
   * USDC, and some XLM to pay the network fee of each step it signs.
   */
  async usdcStatus(
    user: AuthUser,
  ): Promise<{ address: string; usdc: UsdcReadiness; xlmForFees: string | null }> {
    const [usdc, xlmForFees] = await Promise.all([
      this.stellar.usdcReadiness(user.stellarAddress),
      this.stellar.spendableXlm(user.stellarAddress),
    ]);
    return { address: user.stellarAddress, usdc, xlmForFees };
  }

  async prepareTrustline(user: AuthUser): Promise<PreparedTransaction> {
    const readiness = await this.stellar.usdcReadiness(user.stellarAddress);
    if (readiness === 'ready') {
      throw new BadRequestException('Your wallet already trusts USDC');
    }
    if (readiness === 'no_account') {
      throw new BadRequestException(
        'Your wallet is not active on Stellar yet. Fund it with some XLM first',
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
}

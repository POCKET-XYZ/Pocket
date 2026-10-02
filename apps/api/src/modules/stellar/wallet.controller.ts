import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth';
import { SignedTransactionDto } from './dto/signed-transaction.dto';
import { UsdcPaymentDto } from './dto/usdc-payment.dto';
import { WalletService } from './wallet.service';
import { ESCROW_RATE_LIMIT, RateLimit } from '../../common/rate-limit/rate-limit.decorator';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  /** Whether the signed-in wallet can send and receive USDC. */
  @RateLimit(ESCROW_RATE_LIMIT)
  @Get('usdc')
  usdc(@CurrentUser() user: AuthUser) {
    return this.wallet.usdcStatus(user);
  }

  /** Trustline transaction for the wallet to sign. */
  @RateLimit(ESCROW_RATE_LIMIT)
  @Post('usdc-trustline/prepare')
  prepareTrustline(@CurrentUser() user: AuthUser) {
    return this.wallet.prepareTrustline(user);
  }

  @RateLimit(ESCROW_RATE_LIMIT)
  @Post('usdc-trustline/submit')
  submitTrustline(@CurrentUser() user: AuthUser, @Body() dto: SignedTransactionDto) {
    return this.wallet.submitTrustline(user, dto.signedXdr);
  }

  /** USDC payment to another Stellar address, for the wallet to sign. */
  @RateLimit(ESCROW_RATE_LIMIT)
  @Post('usdc-payment/prepare')
  preparePayment(@CurrentUser() user: AuthUser, @Body() dto: UsdcPaymentDto) {
    return this.wallet.preparePayment(user, dto);
  }

  @RateLimit(ESCROW_RATE_LIMIT)
  @Post('usdc-payment/submit')
  submitPayment(@CurrentUser() user: AuthUser, @Body() dto: SignedTransactionDto) {
    return this.wallet.submitPayment(user, dto.signedXdr);
  }

  /** The latest USDC payments in and out of the signed-in wallet. */
  @RateLimit(ESCROW_RATE_LIMIT)
  @Get('usdc-payments')
  payments(@CurrentUser() user: AuthUser) {
    return this.wallet.payments(user);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  RateLimit,
  type RateLimitRule,
} from '../../common/rate-limit/rate-limit.decorator';
import type { AuthUser } from '../../common/types/auth';
import type { DiditWebhookHeaders } from './didit-signature';
import { StartKycDto } from './dto/start-kyc.dto';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { VerificationService } from './verification.service';

/** Each identity-check call reaches Didit: a few a minute is all a person needs. */
const KYC_RATE_LIMIT: RateLimitRule = { bucket: 'kyc', limit: 10, windowSeconds: 60 };

@ApiTags('verification')
@ApiBearerAuth()
@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  /**
   * Complete the account details: the identity check comes next when Didit
   * is on, and otherwise this approves the account.
   */
  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitVerificationDto) {
    return this.verification.submit(user.sub, dto);
  }

  /** The signed-in user's latest verification request. */
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.verification.latestFor(user.sub);
  }

  /** Whether an identity check through Didit activates accounts. */
  @Get('kyc')
  kyc() {
    return { enabled: this.verification.kycEnabled };
  }

  /** The link to Didit's identity check for the pending request. */
  @Post('kyc')
  @RateLimit(KYC_RATE_LIMIT)
  // The DTO only admits consent: true, so a request without it never gets here.
  startKyc(@CurrentUser() user: AuthUser, @Body() _consent: StartKycDto) {
    return this.verification.startKyc(user.sub);
  }

  /** Read the identity check back from Didit, on return from its page. */
  @Post('kyc/refresh')
  @RateLimit(KYC_RATE_LIMIT)
  refreshKyc(@CurrentUser() user: AuthUser) {
    return this.verification.refreshKyc(user.sub);
  }

  /** Didit's webhook. Authenticated by its signature, not by a session. */
  @Public()
  @Post('kyc/webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(@Req() request: RawBodyRequest<Request>) {
    return this.verification.handleKycWebhook(
      request.body as unknown,
      request.headers as DiditWebhookHeaders,
      request.rawBody,
    );
  }
}

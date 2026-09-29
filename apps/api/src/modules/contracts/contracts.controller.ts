import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import type { AuthUser } from '../../common/types/auth';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { SignedTransactionDto } from '../stellar/dto/signed-transaction.dto';
import { ESCROW_RATE_LIMIT, RateLimit } from '../../common/rate-limit/rate-limit.decorator';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  /** Hire an applicant: pick their application and define the milestones. */
  @Roles('startup')
  @Verified()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateContractDto) {
    return this.contracts.create(user, dto);
  }

  @Roles('startup', 'specialist')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.contracts.mine(user);
  }

  /** Contract with milestones, deliveries, disputes and on-chain transactions. */
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.detail(user, id);
  }

  /** The specialist accepts the terms and the escrow is deployed. */
  @Roles('specialist')
  @Verified()
  @RateLimit(ESCROW_RATE_LIMIT)
  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.accept(user, id);
  }

  @Roles('specialist')
  @Verified()
  @Post(':id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.decline(user, id);
  }

  /** Funding transaction for the startup's wallet to sign. */
  @Roles('startup')
  @Verified()
  @RateLimit(ESCROW_RATE_LIMIT)
  @Post(':id/fund/prepare')
  prepareFund(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.prepareFund(user, id);
  }

  @Roles('startup')
  @Verified()
  @RateLimit(ESCROW_RATE_LIMIT)
  @Post(':id/fund/submit')
  submitFund(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignedTransactionDto,
  ) {
    return this.contracts.submitFund(user, id, dto.signedXdr);
  }

  /** Re-check the escrow balance when the deposit took a moment to show. */
  @Roles('startup')
  @Verified()
  @RateLimit(ESCROW_RATE_LIMIT)
  @Post(':id/fund/sync')
  syncFunding(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.syncFunding(user, id);
  }
}

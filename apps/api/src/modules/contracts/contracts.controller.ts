import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActiveAccount, Verified } from '../../common/decorators/verified.decorator';
import type { AuthUser } from '../../common/types/auth';
import { sendPrivateFile } from '../../common/uploads/send-file';
import { ContractsService } from './contracts.service';
import { ReportService } from './report.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { AcceptTermsDto, UpdateDetailsDto, UpdateTermsDto } from './dto/update-terms.dto';
import { SignedTransactionDto } from '../stellar/dto/signed-transaction.dto';
import {
  ESCROW_RATE_LIMIT,
  RateLimit,
} from '../../common/rate-limit/rate-limit.decorator';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly reports: ReportService,
  ) {}

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

  /** Results report: KPIs against targets, milestones against dates, payments. */
  @Get(':id/report')
  report(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.report(user, id);
  }

  /** The report's payments as a CSV, for accounting. */
  @Get(':id/report/csv')
  async reportCsv(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    sendPrivateFile(res, await this.reports.csv(user, id));
  }

  /**
   * The specialist accepts the terms and the escrow is deployed. This is where
   * a specialist's identity check is required, before any money is involved.
   */
  @Roles('specialist')
  @Verified()
  @RateLimit(ESCROW_RATE_LIMIT)
  @Post(':id/accept')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptTermsDto,
  ) {
    return this.contracts.accept(user, id, dto.termsVersion);
  }

  // Turning an offer down takes no identity check: only accepting one does.
  @Roles('specialist')
  @ActiveAccount()
  @Post(':id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.decline(user, id);
  }

  /** The startup changes terms the specialist has not accepted yet. */
  @Roles('startup')
  @Verified()
  @Put(':id/terms')
  updateTerms(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTermsDto,
  ) {
    return this.contracts.updateTerms(user, id, dto);
  }

  /**
   * The startup changes dates, descriptions or criteria of milestones not
   * delivered yet, once the specialist accepted. The escrow stays as it is.
   */
  @Roles('startup')
  @Verified()
  @Put(':id/details')
  updateDetails(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDetailsDto,
  ) {
    return this.contracts.updateDetails(user, id, dto);
  }

  /**
   * The specialist saw what the startup changed. No role guard: an account
   * that is also a startup may be acting as one when it opens the contract.
   */
  @Post(':id/details/seen')
  @HttpCode(204)
  async changesSeen(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.contracts.markChangesSeen(user, id);
  }

  /** The startup takes back terms the specialist has not accepted yet. */
  @Roles('startup')
  @Verified()
  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.withdrawOffer(user, id);
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

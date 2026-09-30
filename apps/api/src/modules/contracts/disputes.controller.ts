import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { DisputesService } from './disputes.service';
import { AddEvidenceDto, ListDisputesDto, ResolveDisputeDto } from './dto/dispute.dto';
import { ESCROW_RATE_LIMIT, RateLimit } from '../../common/rate-limit/rate-limit.decorator';

@ApiTags('disputes')
@ApiBearerAuth()
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  /** A dispute with its evidence, for the two parties and managers. */
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disputes.detail(user, id);
  }

  @Post(':id/evidence')
  addEvidence(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddEvidenceDto,
  ) {
    return this.disputes.addEvidence(user, id, dto);
  }
}

@ApiTags('manager')
@ApiBearerAuth()
@Roles('manager')
@Controller('manager/disputes')
export class ManagerDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  /** Dispute queue. Defaults to the ones still open. */
  @Get()
  list(@Query() query: ListDisputesDto) {
    return this.disputes.list(query.status);
  }

  @RateLimit(ESCROW_RATE_LIMIT)

  @Post(':id/resolve')
  resolve(
    @CurrentUser() manager: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputes.resolve(manager, id, dto);
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TractionService } from './traction.service';

@ApiTags('stats')
@Controller()
export class StatsController {
  constructor(private readonly traction: TractionService) {}

  /** Pocket's traction read from Stellar, for the public stats page. */
  @Public()
  @Get('stats')
  stats() {
    return this.traction.publicStats();
  }

  /** Every escrow of the database against the chain, for a manager. */
  @ApiBearerAuth()
  @Roles('manager')
  @Get('manager/chain-check')
  chainCheck() {
    return this.traction.chainCheck();
  }
}

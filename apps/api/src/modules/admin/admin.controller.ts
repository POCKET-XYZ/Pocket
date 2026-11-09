import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

/** The admin's view: Pocket's team checks and follows everything from here. */
@ApiTags('manager')
@ApiBearerAuth()
@Controller('manager')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** What needs a look now, Pocket's accounts on chain, and the counts. */
  @Roles('manager')
  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  /** Every contract, newest first. */
  @Roles('manager')
  @Get('contracts')
  contracts() {
    return this.admin.contracts();
  }

  /** One contract against its escrow on chain, read now. */
  @Roles('manager')
  @Get('contracts/:id/check')
  contractCheck(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.contractCheck(id);
  }

  /** Every account, newest first. */
  @Roles('manager')
  @Get('users')
  users() {
    return this.admin.users();
  }

  /** Every job, newest first. */
  @Roles('manager')
  @Get('jobs')
  jobs() {
    return this.admin.jobs();
  }
}

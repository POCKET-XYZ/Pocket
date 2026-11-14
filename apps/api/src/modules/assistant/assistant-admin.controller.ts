import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { AssistantAdminService } from './assistant-admin.service';

/** The assistant's month for Pocket's team: spend, use and outcomes. */
@ApiTags('manager')
@ApiBearerAuth()
@Roles('manager')
@Controller('manager/assistant')
export class AssistantAdminController {
  constructor(private readonly admin: AssistantAdminService) {}

  @ApiQuery({ name: 'month', required: false, description: 'AAAA-MM, the current month by default' })
  @Get('usage')
  usage(@Query('month') month?: string) {
    return this.admin.usage(month);
  }
}

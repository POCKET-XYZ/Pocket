import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import type { AuthUser } from '../../common/types/auth';
import { KpiTemplateDto } from './dto/kpi-template.dto';
import { KpiTemplatesService } from './kpi-templates.service';

/** A startup's saved sets of KPIs, verified startups only, like posting jobs. */
@ApiTags('kpi-templates')
@ApiBearerAuth()
@Roles('startup')
@Verified()
@Controller('kpi-templates')
export class KpiTemplatesController {
  constructor(private readonly templates: KpiTemplatesService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.templates.mine(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: KpiTemplateDto) {
    return this.templates.create(user, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KpiTemplateDto,
  ) {
    return this.templates.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.remove(user, id);
  }
}

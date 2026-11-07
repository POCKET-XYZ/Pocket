import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { sendPrivateFile } from '../../common/uploads/send-file';
import { DashboardService } from './dashboard.service';
import { PeriodQueryDto } from './dto/period-query.dto';
import { ReportService } from './report.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly reports: ReportService,
  ) {}

  /** What a startup spent and got for it, across its contracts. */
  @Roles('startup')
  @Get('dashboard/startup')
  startup(@CurrentUser() user: AuthUser) {
    return this.dashboard.startup(user);
  }

  /** What a specialist collected and has coming, across their contracts. */
  @Roles('specialist')
  @Get('dashboard/specialist')
  specialist(@CurrentUser() user: AuthUser) {
    return this.dashboard.specialist(user);
  }

  /** What a startup or a specialist did between two dates, across their contracts. */
  @Roles('startup', 'specialist')
  @Get('reports/period')
  period(@CurrentUser() user: AuthUser, @Query() query: PeriodQueryDto) {
    return this.reports.period(user, query);
  }

  /** The period's payments as a CSV, for accounting. */
  @Roles('startup', 'specialist')
  @Get('reports/period/csv')
  async periodCsv(
    @CurrentUser() user: AuthUser,
    @Query() query: PeriodQueryDto,
    @Res() res: Response,
  ) {
    sendPrivateFile(res, await this.reports.periodCsv(user, query));
  }

  /** A specialist's finished work, for their public profile. */
  @Public()
  @Get('profiles/:userId/track-record')
  trackRecord(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.dashboard.trackRecord(userId);
  }
}

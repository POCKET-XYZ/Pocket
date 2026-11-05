import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

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

  /** A specialist's finished work, for their public profile. */
  @Public()
  @Get('profiles/:userId/track-record')
  trackRecord(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.dashboard.trackRecord(userId);
  }
}

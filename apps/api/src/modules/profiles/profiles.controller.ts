import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import type { AuthUser } from '../../common/types/auth';
import { Roles } from '../../common/decorators/roles.decorator';
import { BrowseSpecialistsDto } from './dto/browse-specialists.dto';
import { BrowseStartupsDto } from './dto/browse-startups.dto';
import { SpecialistProfileDto } from './dto/specialist-profile.dto';
import { StartupProfileDto } from './dto/startup-profile.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  /** The profile of the signed-in user. */
  @ApiBearerAuth()
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.profiles.mine(user);
  }

  @ApiBearerAuth()
  @Roles('startup')
  @Verified()
  @Put('me/startup')
  saveStartup(@CurrentUser() user: AuthUser, @Body() dto: StartupProfileDto) {
    return this.profiles.saveStartup(user, dto);
  }

  @ApiBearerAuth()
  @Roles('specialist')
  @Verified()
  @Put('me/specialist')
  saveSpecialist(@CurrentUser() user: AuthUser, @Body() dto: SpecialistProfileDto) {
    return this.profiles.saveSpecialist(user, dto);
  }

  /** Directory of approved specialists, filtered by category or free text. */
  @Public()
  @Get('specialists')
  browseSpecialists(@Query() query: BrowseSpecialistsDto) {
    return this.profiles.browseSpecialists(query);
  }

  /** Directory of approved startups, so specialists can see who is hiring. */
  @Public()
  @Get('startups')
  browseStartups(@Query() query: BrowseStartupsDto) {
    return this.profiles.browseStartups(query);
  }

  /** Public profile of an approved user. */
  @Public()
  @Get(':userId')
  publicProfile(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.profiles.publicProfile(userId);
  }
}

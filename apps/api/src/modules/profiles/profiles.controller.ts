import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import type { AuthUser } from '../../common/types/auth';
import { Roles } from '../../common/decorators/roles.decorator';
import { BrowseSpecialistsDto } from './dto/browse-specialists.dto';
import { BrowseStartupsDto } from './dto/browse-startups.dto';
import { SpecialistProfileDto } from './dto/specialist-profile.dto';
import { StartupProfileDto } from './dto/startup-profile.dto';
import { MAX_CV_BYTES, ProfilesService, type UploadedPdf } from './profiles.service';

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

  /** Upload the signed-in specialist's CV as a PDF, up to 4 MB. */
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Roles('specialist')
  @Verified()
  @Post('me/cv')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_CV_BYTES, files: 1, fields: 0 } }),
  )
  uploadCv(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedPdf | undefined,
    @Req() req: Request,
  ) {
    // The address the API answers on, as the client reached it.
    const cvUrl = `${req.protocol}://${req.get('host')}/api/profiles/${user.sub}/cv`;
    return this.profiles.saveCv(user, file, cvUrl);
  }

  /** The CV of an approved specialist, as a PDF. */
  @Public()
  @Get(':userId/cv')
  async cv(@Param('userId', ParseUUIDPipe) userId: string, @Res() res: Response) {
    const pdf = await this.profiles.cvOf(userId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="cv.pdf"',
      'Cache-Control': 'private, max-age=300',
      // A PDF is shown, never run as a page of the API.
      'Content-Security-Policy': "sandbox; default-src 'none'",
    });
    res.send(pdf);
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

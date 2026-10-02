import {
  Body,
  Controller,
  Delete,
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
import { ConfigService } from '@nestjs/config';
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
import {
  MAX_CV_BYTES,
  MAX_LOGO_BYTES,
  ProfilesService,
  type UploadedPdf,
} from './profiles.service';
import type { UploadedBytes } from '../../common/uploads/file-type';

@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly config: ConfigService,
  ) {}

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
    const cvUrl = `${this.publicBase(req)}/profiles/${user.sub}/cv`;
    return this.profiles.saveCv(user, file, cvUrl);
  }

  /** Upload the signed-in startup's logo: PNG, JPEG or WebP, up to 1 MB. */
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Roles('startup')
  @Verified()
  @Post('me/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 0 },
    }),
  )
  uploadLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedBytes | undefined,
    @Req() req: Request,
  ) {
    // A new address for every upload, so browsers that cached the old logo
    // fetch the new one. The query is ignored when serving it.
    const version = Date.now().toString(36);
    const logoUrl = `${this.publicBase(req)}/profiles/${user.sub}/logo?v=${version}`;
    return this.profiles.saveLogo(user, file, logoUrl);
  }

  /** Remove the signed-in startup's logo, uploaded or linked. */
  @ApiBearerAuth()
  @Roles('startup')
  @Verified()
  @Delete('me/logo')
  removeLogo(@CurrentUser() user: AuthUser) {
    return this.profiles.removeLogo(user);
  }

  /** The logo an approved startup uploaded, as the image it is. */
  @Public()
  @Get(':userId/logo')
  async logo(@Param('userId', ParseUUIDPipe) userId: string, @Res() res: Response) {
    const logo = await this.profiles.logoOf(userId);
    res.set({
      'Content-Type': logo.contentType,
      'Content-Disposition': 'inline; filename="logo"',
      'X-Content-Type-Options': 'nosniff',
      // Each upload gets a new address, so a cached copy is never stale for long.
      'Cache-Control': 'public, max-age=86400',
      // Shown in <img> tags on the web app, which is another origin.
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // An image is shown, never run as a page of the API.
      'Content-Security-Policy': "sandbox; default-src 'none'",
    });
    res.send(logo.data);
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

  /**
   * The API's public address when it is configured; otherwise the one the
   * client reached, which behind a misconfigured proxy may say http.
   */
  private publicBase(req: Request): string {
    return (
      this.config.get<string>('apiPublicUrl') ||
      `${req.protocol}://${req.get('host')}/api`
    );
  }
}

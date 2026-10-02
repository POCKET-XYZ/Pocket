import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import type { AuthUser } from '../../common/types/auth';
import type { UploadedBytes } from '../../common/uploads/file-type';
import { sendPrivateFile } from '../../common/uploads/send-file';
import { ApplicationsService } from './applications.service';
import { ApplyDto } from './dto/apply.dto';
import { BrowseJobsDto } from './dto/browse-jobs.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';
import {
  MAX_REPORT_TEMPLATE_BYTES,
  ReportTemplatesService,
} from './report-templates.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly applications: ApplicationsService,
    private readonly reportTemplates: ReportTemplatesService,
  ) {}

  @ApiBearerAuth()
  @Roles('startup')
  @Verified()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) {
    return this.jobs.create(user, dto);
  }

  /** Board of open jobs, filtered by category or free text. */
  @Public()
  @Get()
  board(@Query() query: BrowseJobsDto) {
    return this.jobs.board(query);
  }

  /** Jobs the signed-in startup posted, in every state. */
  @ApiBearerAuth()
  @Roles('startup')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.jobs.mine(user);
  }

  @Public()
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.detail(id);
  }

  @ApiBearerAuth()
  @Roles('startup')
  @Verified()
  @Post(':id/close')
  close(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.close(user, id);
  }

  /**
   * Attach or replace the report template the specialist fills in: a PDF,
   * Excel (.xlsx), Word (.docx) or CSV file, up to 5 MB, while the job is open.
   */
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Roles('startup')
  @Verified()
  @Post(':id/report-template')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_REPORT_TEMPLATE_BYTES, files: 1, fields: 0 },
    }),
  )
  uploadReportTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedBytes | undefined,
  ) {
    return this.reportTemplates.save(user, id, file);
  }

  @ApiBearerAuth()
  @Roles('startup')
  @Verified()
  @Delete(':id/report-template')
  removeReportTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportTemplates.remove(user, id);
  }

  /**
   * The job's report template, always as a download, for its startup,
   * verified specialists and managers. Never public.
   */
  @ApiBearerAuth()
  @Get(':id/report-template')
  async reportTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    sendPrivateFile(res, await this.reportTemplates.fileOf(user, id));
  }

  @ApiBearerAuth()
  @Roles('specialist')
  @Verified()
  @Post(':id/applications')
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDto,
  ) {
    return this.applications.apply(user, id, dto);
  }

  /** Applicants to one of the signed-in startup's jobs. */
  @ApiBearerAuth()
  @Roles('startup')
  @Get(':id/applications')
  applicants(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.applications.forJob(user, id);
  }
}

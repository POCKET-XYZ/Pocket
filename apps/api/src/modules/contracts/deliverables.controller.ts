import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import type { AuthUser } from '../../common/types/auth';
import type { UploadedBytes } from '../../common/uploads/file-type';
import { sendPrivateFile } from '../../common/uploads/send-file';
import { DeliverablesService, MAX_ATTACHMENT_BYTES } from './deliverables.service';

@ApiTags('deliverables')
@ApiBearerAuth()
@Controller('deliverables')
export class DeliverablesController {
  constructor(private readonly deliverables: DeliverablesService) {}

  /**
   * Attach a file, up to 5 MB, to the latest delivery's report: a PDF, an
   * Excel, Word or CSV file such as the startup's filled report template, or
   * an image.
   */
  @ApiConsumes('multipart/form-data')
  @Roles('specialist')
  @Verified()
  @Post(':id/attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0 },
    }),
  )
  attach(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedBytes | undefined,
  ) {
    return this.deliverables.saveAttachment(user, id, file);
  }

  /** The delivery's file, for the contract's two parties and managers. */
  @Get(':id/attachment')
  async attachment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    sendPrivateFile(res, await this.deliverables.attachmentOf(user, id));
  }
}

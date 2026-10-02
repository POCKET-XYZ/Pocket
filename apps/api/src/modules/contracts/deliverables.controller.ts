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
import { DeliverablesService, MAX_ATTACHMENT_BYTES } from './deliverables.service';

@ApiTags('deliverables')
@ApiBearerAuth()
@Controller('deliverables')
export class DeliverablesController {
  constructor(private readonly deliverables: DeliverablesService) {}

  /** Attach a PDF or an image, up to 5 MB, to the latest delivery's report. */
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
    const file = await this.deliverables.attachmentOf(user, id);
    // A PDF is saved, never opened as a page of the API; an image may show.
    const disposition = file.contentType === 'application/pdf' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `${disposition}; filename="${file.fileName}"`,
      'X-Content-Type-Options': 'nosniff',
      // Private to the contract: no shared cache keeps a copy.
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    });
    res.send(file.data);
  }
}

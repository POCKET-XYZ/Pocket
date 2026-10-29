import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { VerificationService } from './verification.service';

@ApiTags('verification')
@ApiBearerAuth()
@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  /** Complete the account details, which approves the account. */
  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitVerificationDto) {
    return this.verification.submit(user.sub, dto);
  }

  /** The signed-in user's latest verification request. */
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.verification.latestFor(user.sub);
  }
}

import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** The signed-in user, including role and verification status. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.sub);
  }

  /** Accept the current Terms and Privacy Policy, after they changed. */
  @Post('me/terms')
  @HttpCode(200)
  acceptTerms(@CurrentUser() user: AuthUser, @Body() dto: AcceptTermsDto, @Ip() ip: string) {
    return this.users.acceptTerms(user.sub, dto.version, ip);
  }

  /** Download everything Pocket holds about you (access and portability). */
  @RateLimit({ bucket: 'export', limit: 5, windowSeconds: 3600 })
  @Get('me/export')
  export(@CurrentUser() user: AuthUser) {
    return this.users.exportData(user.sub);
  }

  /** Delete your account and its personal data. Cannot be undone. */
  @Post('me/delete')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Body() _dto: DeleteAccountDto): Promise<void> {
    await this.users.deleteAccount(user.sub);
  }
}

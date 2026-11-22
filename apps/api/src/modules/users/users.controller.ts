import { Body, Controller, Get, HttpCode, Ip, Post, Put } from '@nestjs/common';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { ActiveStartupDto } from './dto/active-startup.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { RoleDto } from './dto/role.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** The signed-in user: role, every role it has, its startups and verification status. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.sub);
  }

  /** Add the other role to the account (startup and specialist) and switch to it. */
  @Post('me/roles')
  @HttpCode(200)
  addRole(@CurrentUser() user: AuthUser, @Body() dto: RoleDto) {
    return this.users.addRole(user.sub, dto.role);
  }

  /** Switch to another role the account has. */
  @Put('me/role')
  switchRole(@CurrentUser() user: AuthUser, @Body() dto: RoleDto) {
    return this.users.switchRole(user.sub, dto.role);
  }

  /** Act as another of the account's startups. */
  @Put('me/startup')
  switchStartup(@CurrentUser() user: AuthUser, @Body() dto: ActiveStartupDto) {
    return this.users.switchStartup(user.sub, dto.startupId);
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

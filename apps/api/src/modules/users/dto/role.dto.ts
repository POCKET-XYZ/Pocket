import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { MARKET_ROLES, type MarketRole } from '../roles';

/** POST /users/me/roles and PUT /users/me/role */
export class RoleDto {
  @ApiProperty({ enum: MARKET_ROLES })
  @IsIn(MARKET_ROLES, { message: 'Elige empresa o experto' })
  role: MarketRole;
}

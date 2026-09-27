import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { SIGN_UP_ROLES, type SignUpRole } from './login.dto';

/** Sign in with a Pollar session instead of a wallet signature. */
export class PollarLoginDto {
  @ApiProperty({ description: 'Access token the Pollar SDK issued in the browser' })
  @IsString()
  @Length(20, 4000)
  accessToken: string;

  @ApiPropertyOptional({
    enum: SIGN_UP_ROLES,
    description: 'Required on the first login, when the account is created',
  })
  @IsOptional()
  @IsIn(SIGN_UP_ROLES)
  role?: SignUpRole;
}

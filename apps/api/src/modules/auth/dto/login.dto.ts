import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

/** Roles a user can pick when signing up. Managers are created internally. */
export const SIGN_UP_ROLES = ['startup', 'specialist'] as const;
export type SignUpRole = (typeof SIGN_UP_ROLES)[number];

export class LoginDto {
  @ApiProperty({ description: 'Stellar public key (G...) that signed the challenge' })
  @IsString()
  @Length(56, 56)
  stellarAddress: string;

  @ApiProperty({ description: 'Challenge transaction XDR signed by the wallet' })
  @IsString()
  signedXdr: string;

  @ApiPropertyOptional({
    enum: SIGN_UP_ROLES,
    description: 'Required on the first login, when the account is created',
  })
  @IsOptional()
  @IsIn(SIGN_UP_ROLES)
  role?: SignUpRole;

  @ApiPropertyOptional({
    description: 'Version of the Terms and Privacy Policy accepted. Required to create the account',
  })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  acceptTerms?: string;
}

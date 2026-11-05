import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AcceptTermsDto {
  @ApiProperty({ description: 'Version of the Terms and Privacy Policy accepted' })
  @IsString()
  @Length(1, 20)
  version: string;
}

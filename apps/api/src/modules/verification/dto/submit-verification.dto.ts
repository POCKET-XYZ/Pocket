import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { IsHttpsUrl } from '../../../common/decorators/is-https-url.decorator';

/**
 * The account details a startup or specialist completes before using the
 * marketplace. Nobody reviews them by hand: sending them approves the account.
 */
export class SubmitVerificationDto {
  @ApiProperty({ description: 'Legal name of the person submitting the request' })
  @IsString()
  @Length(2, 120)
  fullName: string;

  @ApiProperty()
  @IsEmail()
  contactEmail: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code', example: 'CR' })
  @IsISO31661Alpha2()
  country: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHttpsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({
    description: 'Company site for startups, portfolio for specialists',
  })
  @IsOptional()
  @IsHttpsUrl()
  websiteUrl?: string;

  @ApiPropertyOptional({ description: 'Startups: registered company name' })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  companyName?: string;

  @ApiPropertyOptional({ description: 'Startups: company registration or tax id' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  companyRegistrationId?: string;

  @ApiPropertyOptional({ description: 'Anything else Pocket should know' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

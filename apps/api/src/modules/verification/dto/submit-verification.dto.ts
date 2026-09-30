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
 * Lightweight KYC/KYB: what a startup or specialist sends for a manager to
 * review. Documents are links for now, not uploads.
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

  @ApiPropertyOptional({ description: 'Anything else the manager should know' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

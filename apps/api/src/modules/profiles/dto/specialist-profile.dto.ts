import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** A piece of past work: where to see it and what it achieved. */
export class CaseStudyDto {
  @ApiProperty({ example: 'https://example.com/campaign' })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'The outcome in one line',
    example: '+40% followers in 2 months',
  })
  @IsString()
  @Length(3, 160)
  result: string;
}

/** The fixed template every specialist fills in. Rates are in USDC. */
export class SpecialistProfileDto {
  @ApiProperty()
  @IsString()
  @Length(2, 120)
  displayName: string;

  @ApiProperty({ example: 'B2B SaaS outbound specialist' })
  @IsString()
  @Length(10, 160)
  headline: string;

  @ApiProperty()
  @IsString()
  @Length(50, 2000)
  bio: string;

  @ApiProperty({ enum: ServiceCategory, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(4)
  @IsEnum(ServiceCategory, { each: true })
  categories: ServiceCategory[];

  @ApiPropertyOptional({ type: [String], example: ['cold email', 'HubSpot'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({
    type: [CaseStudyDto],
    description: 'Past work with its outcome. The best filter a startup has.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CaseStudyDto)
  caseStudies?: CaseStudyDto[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Tools they work with',
    example: ['Meta Ads', 'GA4', 'HubSpot'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tools?: string[];

  @ApiPropertyOptional({ description: 'Years working in this field', example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  yearsExperience?: number;

  @ApiPropertyOptional({ type: [String], example: ['Spanish', 'English'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: 'UTC-6' })
  @IsOptional()
  @IsString()
  @Length(2, 60)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Hours a week they can take on', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(80)
  weeklyHours?: number;

  @ApiPropertyOptional({ description: 'Hourly rate in USDC' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Smallest project they take, in USDC' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minProjectBudget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  portfolioUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: 'Link to the CV, e.g. a PDF on Google Drive' })
  @IsOptional()
  @IsUrl()
  cvUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  location?: string;
}

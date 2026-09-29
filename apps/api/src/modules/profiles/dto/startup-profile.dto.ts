import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StartupStage } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { IsHttpsUrl } from '../../../common/decorators/is-https-url.decorator';

/** The fixed template every startup fills in. */
export class StartupProfileDto {
  @ApiProperty()
  @IsString()
  @Length(2, 160)
  companyName: string;

  @ApiProperty({ description: 'One sentence describing what the company does' })
  @IsString()
  @Length(10, 200)
  oneLiner: string;

  @ApiProperty({ example: 'Fintech' })
  @IsString()
  @Length(2, 80)
  sector: string;

  @ApiProperty({ enum: StartupStage })
  @IsEnum(StartupStage)
  stage: StartupStage;

  @ApiProperty({ description: 'What the startup needs help with right now' })
  @IsString()
  @Length(20, 1000)
  lookingFor: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHttpsUrl()
  websiteUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHttpsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({
    description: 'Registered name, when it differs from the trading name',
    example: 'Pocket Demo Labs S.A.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  legalName?: string;

  @ApiPropertyOptional({
    description: 'Role of the person who signs the contracts',
    example: 'Co-founder',
  })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  contactRole?: string;

  @ApiPropertyOptional({ type: [String], example: ['Spanish', 'English'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: 'San Jose, Costa Rica' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  location?: string;
}

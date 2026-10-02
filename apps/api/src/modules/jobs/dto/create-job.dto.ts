import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** A milestone of the payment plan the startup posts with the job. */
export class JobMilestoneDto {
  @ApiProperty({ example: 'Video 1' })
  @IsString()
  @Length(3, 120)
  title: string;

  @ApiProperty({ description: 'What has to be delivered' })
  @IsString()
  @Length(10, 2000)
  description: string;

  @ApiProperty({
    description: 'What it has to meet for the startup to approve it',
    example: 'Vertical, around 60 seconds, with subtitles and the brand logo',
  })
  @IsString()
  @Length(10, 2000)
  acceptanceCriteria: string;

  @ApiProperty({ description: 'Part of the budget this milestone pays', example: 150 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0.0000001)
  @Max(1_000_000)
  amount: number;

  @ApiProperty({ example: '2026-10-15' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be a date as YYYY-MM-DD' })
  @IsDateString({ strict: true })
  dueDate: string;
}

/** The most KPIs a job can be measured on. */
export const MAX_JOB_KPIS = 10;

/** Something the work will be measured on, e.g. "Qualified leads". */
export class JobKpiDto {
  @ApiProperty({ example: 'Qualified leads' })
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiPropertyOptional({ description: 'Free text', example: '50 per month' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  target?: string;

  @ApiPropertyOptional({ example: 'leads' })
  @IsOptional()
  @IsString()
  @Length(1, 30)
  unit?: string;
}

/** What a startup fills in to post a job. Budget is in USDC. */
export class CreateJobDto {
  @ApiProperty({ example: 'Outbound campaign for our B2B wallet' })
  @IsString()
  @Length(10, 120)
  title: string;

  @ApiProperty({ description: 'Scope of the work' })
  @IsString()
  @Length(50, 5000)
  description: string;

  @ApiProperty({ enum: ServiceCategory })
  @IsEnum(ServiceCategory)
  category: ServiceCategory;

  @ApiProperty({ description: 'What the startup expects to receive at the end' })
  @IsString()
  @Length(10, 2000)
  deliverables: string;

  @ApiProperty({ description: 'Budget in USDC', example: 500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(1)
  @Max(1_000_000)
  budget: number;

  @ApiProperty({
    description: 'Calendar date the work is needed by',
    example: '2026-10-31',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'deadline must be a date as YYYY-MM-DD' })
  @IsDateString({ strict: true })
  deadline: string;

  @ApiPropertyOptional({
    description: 'Rounds of changes the price includes',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  revisionRounds?: number;

  @ApiPropertyOptional({
    description: 'Where the work is published or used',
    example: 'TikTok and Reels',
  })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  channel?: string;

  @ApiPropertyOptional({
    description: 'Language of the content itself',
    example: 'Spanish',
  })
  @IsOptional()
  @IsString()
  @Length(2, 60)
  contentLanguage?: string;

  @ApiPropertyOptional({
    description: 'What the startup hands over',
    example: 'Logo, brand guide and access to the app',
  })
  @IsOptional()
  @IsString()
  @Length(5, 2000)
  startupProvides?: string;

  @ApiProperty({
    type: [JobMilestoneDto],
    description: 'The payment plan: 1 to 5 milestones that add up to the budget',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => JobMilestoneDto)
  milestones: JobMilestoneDto[];

  @ApiPropertyOptional({
    type: [JobKpiDto],
    description: `What the work will be measured on, up to ${MAX_JOB_KPIS}. Each delivery reports a result for every one`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_JOB_KPIS)
  @ValidateNested({ each: true })
  @Type(() => JobKpiDto)
  kpis?: JobKpiDto[];
}

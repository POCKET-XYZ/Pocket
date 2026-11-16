import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MilestoneInputDto {
  @ApiProperty({ example: 'Lead list' })
  @IsString()
  @Length(3, 120)
  title: string;

  @ApiProperty({ description: 'What has to be delivered for this milestone' })
  @IsString()
  @Length(10, 2000)
  description: string;

  @ApiPropertyOptional({
    description: 'What it has to meet to be approved. Carried over from the job.',
    example: 'Vertical video, around 60 seconds, with subtitles and the logo',
  })
  @IsOptional()
  @IsString()
  @Length(10, 2000)
  acceptanceCriteria?: string;

  @ApiProperty({ description: 'Amount in USDC', example: 200 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(1)
  @Max(1_000_000)
  amount: number;

  @ApiProperty({ example: '2026-10-15' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dueDate debe ser una fecha con el formato AAAA-MM-DD',
  })
  @IsDateString({ strict: true })
  dueDate: string;
}

/**
 * The startup picks an applicant and splits a price into milestones: the one
 * the applicant asked for, or its own counteroffer, which the applicant then
 * accepts or declines.
 */
export class CreateContractDto {
  @ApiProperty()
  @IsUUID()
  applicationId: string;

  @ApiPropertyOptional({
    description:
      "The price offered, in USDC. Left out, it is the applicant's own price.",
    example: 105,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(1)
  @Max(1_000_000)
  price?: number;

  @ApiProperty({ type: [MilestoneInputDto], minItems: 1, maxItems: 5 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MilestoneInputDto)
  milestones: MilestoneInputDto[];
}

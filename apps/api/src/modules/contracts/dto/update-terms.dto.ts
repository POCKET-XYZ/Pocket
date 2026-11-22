import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsISO8601,
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
import { MilestoneInputDto } from './create-contract.dto';

/**
 * The startup changes the price and the milestones as a whole: before the
 * specialist accepts, or once they accepted but before the deposit. A change
 * to what the escrow holds (price, amounts, milestone names) then sends the
 * terms back to the specialist; anything else keeps the escrow.
 */
export class UpdateTermsDto {
  @ApiProperty({ description: 'The price offered, in USDC', example: 105 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(1)
  @Max(1_000_000)
  price: number;

  @ApiProperty({ type: [MilestoneInputDto], minItems: 1, maxItems: 5 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MilestoneInputDto)
  milestones: MilestoneInputDto[];
}

/** POST /contracts/:id/accept */
export class AcceptTermsDto {
  @ApiPropertyOptional({
    description:
      "The contract's updatedAt as the specialist read it. When the startup changed the terms since, accepting is refused so they read the new ones first.",
    example: '2026-11-22T15:04:05.123Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  termsVersion?: string;
}

/** One milestone's details, the part of it that is not in the escrow. */
export class MilestoneDetailsDto {
  @ApiProperty({ description: 'Zero-based position of the milestone', example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  position: number;

  @ApiProperty({ example: '2026-12-15' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dueDate debe ser una fecha con el formato AAAA-MM-DD',
  })
  @IsDateString({ strict: true })
  dueDate: string;

  @ApiProperty({ description: 'What has to be delivered for this milestone' })
  @IsString()
  @Length(10, 2000)
  description: string;

  @ApiPropertyOptional({ description: 'What it has to meet to be approved' })
  @IsOptional()
  @IsString()
  @Length(10, 2000)
  acceptanceCriteria?: string;
}

/**
 * PUT /contracts/:id/details: dates, descriptions and criteria of milestones
 * not delivered yet, once the specialist accepted. None of it is in the
 * escrow, so the escrow stays as it is.
 */
export class UpdateDetailsDto {
  @ApiProperty({ type: [MilestoneDetailsDto], minItems: 1, maxItems: 5 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDetailsDto)
  milestones: MilestoneDetailsDto[];
}

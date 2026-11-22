import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MilestoneInputDto } from './create-contract.dto';

/**
 * The startup changes terms the specialist has not accepted yet: the price and
 * its milestones, replaced as a whole. Nothing is on chain before acceptance,
 * so this only touches Pocket's own records.
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

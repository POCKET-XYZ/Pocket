import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { IsHttpsUrl } from '../../../common/decorators/is-https-url.decorator';

/** A specialist's offer on a job. The price may differ from the posted budget. */
export class ApplyDto {
  @ApiProperty({ description: 'How they would do it, step by step' })
  @IsString()
  @Length(50, 5000)
  approach: string;

  @ApiPropertyOptional({ description: 'A piece of past work close to this job' })
  @IsOptional()
  @IsHttpsUrl()
  similarWorkUrl?: string;

  @ApiPropertyOptional({
    description: 'What they need from the startup to start',
    example: 'Brand guide and access to the ad account',
  })
  @IsOptional()
  @IsString()
  @Length(5, 2000)
  needsFromStartup?: string;

  @ApiProperty({ description: 'Price in USDC', example: 450 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(1)
  @Max(1_000_000)
  price: number;

  @ApiProperty({
    description: 'Days of work, counted from the moment the escrow is funded',
    example: 14,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  estimatedDays: number;
}

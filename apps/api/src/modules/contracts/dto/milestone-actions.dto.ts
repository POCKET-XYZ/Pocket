import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsHttpsUrl } from '../../../common/decorators/is-https-url.decorator';

/**
 * The result a delivery reports for one of the job's KPIs: a number for a KPI
 * with a numeric target, or that it cannot be measured yet; free text for a
 * KPI that is only tracked.
 */
export class KpiResultDto {
  @ApiProperty({ description: 'The KPI of the job this result is for' })
  @IsUUID()
  kpiId: string;

  @ApiPropertyOptional({
    description: 'For a KPI that is only tracked. Free text, short',
    example: '62 qualified leads',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  value?: string;

  @ApiPropertyOptional({ description: 'For a KPI with a numeric target', example: 62 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-1_000_000_000_000)
  @Max(1_000_000_000_000)
  number?: number;

  @ApiPropertyOptional({ description: 'The KPI cannot be measured yet' })
  @IsOptional()
  @IsBoolean()
  notMeasurable?: boolean;

  @ApiPropertyOptional({ example: 'Two campaigns paused for a week in March' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  comment?: string;
}

/**
 * A specialist's submission for a milestone: a link to the work, a note, and
 * a result for each KPI the job is measured on.
 */
export class DeliverDto {
  @ApiProperty({ description: 'Link to the document, folder, report or campaign' })
  @IsHttpsUrl()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  note?: string;

  @ApiPropertyOptional({
    type: [KpiResultDto],
    description: "One result for each of the job's KPIs. Required when the job has KPIs",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => KpiResultDto)
  results?: KpiResultDto[];
}

export class RequestChangesDto {
  @ApiProperty({ description: 'What the specialist should change' })
  @IsString()
  @Length(5, 2000)
  feedback: string;
}

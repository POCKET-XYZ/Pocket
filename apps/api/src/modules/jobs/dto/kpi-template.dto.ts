import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { JobKpiDto, MAX_JOB_KPIS } from './create-job.dto';

/** A named set of KPIs to reuse when posting jobs. Same limits as a job's KPIs. */
export class KpiTemplateDto {
  @ApiProperty({ example: 'Outbound campaign' })
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty({
    type: [JobKpiDto],
    description: `The KPIs in order, 1 to ${MAX_JOB_KPIS}, each name once`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_JOB_KPIS)
  @ValidateNested({ each: true })
  @Type(() => JobKpiDto)
  kpis: JobKpiDto[];
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { MetricsPeriod } from '@pocket/shared';
import { IsIn, IsOptional } from 'class-validator';

export class MetricsQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(MetricsPeriod),
    default: MetricsPeriod.Month,
  })
  @IsOptional()
  @IsIn(Object.values(MetricsPeriod))
  period?: MetricsPeriod;
}

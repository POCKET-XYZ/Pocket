import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The days a period report covers, both included, in UTC. */
export class PeriodQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'First day; the 1st of this month by default',
  })
  @IsOptional()
  @Matches(DAY, { message: 'La fecha va como AAAA-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description: 'Last day; today by default',
  })
  @IsOptional()
  @Matches(DAY, { message: 'La fecha va como AAAA-MM-DD' })
  to?: string;
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ManagerMetrics } from '@pocket/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { MetricsService } from './metrics.service';

@ApiTags('manager')
@ApiBearerAuth()
@Roles('manager')
@Controller('manager/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Platform metrics for the internal team. Defaults to the last 30 days. */
  @Get()
  get(@Query() query: MetricsQueryDto): Promise<ManagerMetrics> {
    return this.metrics.metrics(query.period);
  }
}

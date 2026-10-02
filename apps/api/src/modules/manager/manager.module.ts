import { Module } from '@nestjs/common';
import { PollarModule } from '../pollar/pollar.module';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [PollarModule],
  controllers: [ManagerController, MetricsController],
  providers: [ManagerService, MetricsService],
})
export class ManagerModule {}

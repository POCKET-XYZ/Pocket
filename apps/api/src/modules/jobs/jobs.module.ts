import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { KpiTemplatesController } from './kpi-templates.controller';
import { KpiTemplatesService } from './kpi-templates.service';
import { ReportTemplatesService } from './report-templates.service';

@Module({
  imports: [NotificationsModule],
  controllers: [JobsController, ApplicationsController, KpiTemplatesController],
  providers: [
    JobsService,
    ApplicationsService,
    KpiTemplatesService,
    ReportTemplatesService,
  ],
  exports: [JobsService, ApplicationsService],
})
export class JobsModule {}

import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StellarModule } from '../stellar/stellar.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { DeliverablesController } from './deliverables.controller';
import { DeliverablesService } from './deliverables.service';
import { DisputesController, ManagerDisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { EscrowService } from './escrow.service';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';

@Module({
  imports: [JobsModule, StellarModule, NotificationsModule],
  controllers: [
    ContractsController,
    MilestonesController,
    DeliverablesController,
    DisputesController,
    ManagerDisputesController,
  ],
  providers: [
    ContractsService,
    EscrowService,
    MilestonesService,
    DeliverablesService,
    DisputesService,
  ],
})
export class ContractsModule {}

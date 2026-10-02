import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PollarModule } from '../pollar/pollar.module';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';

@Module({
  imports: [PollarModule, NotificationsModule],
  controllers: [ManagerController],
  providers: [ManagerService],
})
export class ManagerModule {}

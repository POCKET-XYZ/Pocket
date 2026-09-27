import { Module } from '@nestjs/common';
import { PollarModule } from '../pollar/pollar.module';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';

@Module({
  imports: [PollarModule],
  controllers: [ManagerController],
  providers: [ManagerService],
})
export class ManagerModule {}

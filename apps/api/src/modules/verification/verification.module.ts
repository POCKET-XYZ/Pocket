import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PollarModule } from '../pollar/pollar.module';
import { DiditClient } from './didit.client';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [PollarModule, NotificationsModule],
  controllers: [VerificationController],
  providers: [VerificationService, DiditClient],
  exports: [VerificationService, DiditClient],
})
export class VerificationModule {}

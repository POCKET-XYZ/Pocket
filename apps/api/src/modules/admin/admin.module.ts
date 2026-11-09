import { Module } from '@nestjs/common';
import { StellarModule } from '../stellar/stellar.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/** The admin's view of contracts, users, jobs and Pocket's accounts. */
@Module({
  imports: [StellarModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

import { Module } from '@nestjs/common';
import { StellarModule } from '../stellar/stellar.module';
import { StatsController } from './stats.controller';
import { TractionService } from './traction.service';

/** Pocket's traction, read from the chain. */
@Module({
  imports: [StellarModule],
  controllers: [StatsController],
  providers: [TractionService],
})
export class StatsModule {}

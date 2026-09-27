import { Module } from '@nestjs/common';
import { PollarClient } from './pollar.client';
import { PollarWalletsService } from './pollar-wallets.service';

/** Pollar's server side, shared by sign-in and by the verification queue. */
@Module({
  providers: [PollarClient, PollarWalletsService],
  exports: [PollarClient, PollarWalletsService],
})
export class PollarModule {}

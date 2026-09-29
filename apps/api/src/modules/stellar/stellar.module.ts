import { Module } from '@nestjs/common';
import { ChainOperationsService } from './chain-operations.service';
import { PlatformMonitorService } from './platform-monitor.service';
import { StellarService } from './stellar.service';
import { TrustlessWorkClient } from './trustless-work.client';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController],
  providers: [
    StellarService,
    TrustlessWorkClient,
    ChainOperationsService,
    WalletService,
    PlatformMonitorService,
  ],
  exports: [StellarService, TrustlessWorkClient, ChainOperationsService],
})
export class StellarModule {}

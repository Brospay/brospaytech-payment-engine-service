import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { SmartRoutingModule } from '../smart-routing/smart-routing.module';
import { TSPModule } from '../../tsp/tsp.module';

@Module({
  imports: [
    SmartRoutingModule,
    TSPModule
  ],
  controllers: [SettlementController],
  providers: [SettlementService],
  exports: [SettlementService]
})
export class SettlementModule {}


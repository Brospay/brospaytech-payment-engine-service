import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutService } from './payout.service';
import { PayoutController } from './payout.controller';
import { Payout } from '../../entities/payout.entity';
import { TSPModule } from '../../tsp/tsp.module';
import { SmartRoutingModule } from '../smart-routing/smart-routing.module';
import { GrpcModule } from '../../grpc/grpc.module';
import { EventsModule } from '../../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payout]),
    TSPModule,
    SmartRoutingModule,
    GrpcModule,
    EventsModule,
  ],
  controllers: [PayoutController,],
  providers: [PayoutService],
  exports: [PayoutService],
})
export class PayoutModule {}


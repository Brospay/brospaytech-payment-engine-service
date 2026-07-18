import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';
import { RefundCronService } from './refund-cron.service';
import { RefundWebhookController } from '@/webhooks/refund/refund-webhook.controller';
import { Refund } from '@/entities/refund.entity';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { TSPModule } from '@/tsp/tsp.module';
import { GrpcModule } from '@/grpc/grpc.module';
import { WebhookModule } from '@/webhooks/webhook.module';
import { LoggerService } from '@/common/services/logger.service';
import { EventsModule } from '@/events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Refund,
      PaymentTransaction,
      PaymentIntent
    ]),
    ScheduleModule.forRoot(),
    TSPModule,
    GrpcModule,
    EventsModule,
    forwardRef(() => WebhookModule)
  ],
  controllers: [RefundController, RefundWebhookController],
  providers: [RefundService, RefundCronService, LoggerService],
  exports: [RefundService]
})
export class RefundModule {}


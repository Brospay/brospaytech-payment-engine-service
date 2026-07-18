import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { Payout } from '@/entities/payout.entity';
import { Refund } from '@/entities/refund.entity';
import { CommonModule } from '@/common/common.module';
import { TSPModule } from '@/tsp/tsp.module';
import { GrpcModule } from '@/grpc/grpc.module';
import { PaymentTransactionModule } from '@/modules/payment-transaction/payment-transaction.module';
import { PaymentStatusModule } from '@/modules/payment-status/payment-status.module';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { WebhookTestController } from './webhook-test.controller';
import { MerchantWebhookService } from './merchant/merchant-webhook.service';
import { SulifuPayWebhookHandler, KingdomBankWebhookHandler, PayazaWebhookHandler } from './handlers';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentTransaction,
      PaymentIntent,
      TSPConfiguration,
      Payout,
      Refund,
    ]),
    CommonModule,
    TSPModule,
    GrpcModule,
    PaymentStatusModule,
    forwardRef(() => PaymentTransactionModule),
  ],
  controllers: [
    WebhookController,
    WebhookTestController,
  ],
  providers: [
    WebhookService, 
    MerchantWebhookService,
    SulifuPayWebhookHandler,
    KingdomBankWebhookHandler,
    PayazaWebhookHandler,
  ],
  exports: [WebhookService, MerchantWebhookService],
})
export class WebhookModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';

// Services
import { CommonModule } from '@/common/common.module';
import { TSPModule } from '@/tsp/tsp.module';
import { FraudModule } from '@/fraud/fraud.module';
import { SmartRoutingModule } from '@/modules/smart-routing/smart-routing.module';
import { CustomerResolutionModule } from '@/modules/customer-resolution/customer-resolution.module';
import { PaymentTransactionModule } from '@/modules/payment-transaction/payment-transaction.module';
import { ParallelTSPProcessor } from '@/adapters/parallel-tsp-processor';
import { PaymentIntentService } from './payment-intent.service';
import { PaymentIntentController } from './payment-intent.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentIntent,
      PaymentTransaction,
      TSPConfiguration,
    ]),
    CommonModule,
    TSPModule,
    FraudModule,
    SmartRoutingModule,
    CustomerResolutionModule,
    forwardRef(() => PaymentTransactionModule),
  ],
  controllers: [PaymentIntentController],
  providers: [PaymentIntentService, ParallelTSPProcessor],
  exports: [PaymentIntentService, ParallelTSPProcessor],
})
export class PaymentIntentModule {}
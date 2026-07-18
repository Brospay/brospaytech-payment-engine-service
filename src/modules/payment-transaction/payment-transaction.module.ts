import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentTransactionController } from './payment-transaction.controller';
import { PaymentTransactionService } from './payment-transaction.service';

// Entity imports
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';

// Module imports
import { PaymentIntentModule } from '@/modules/payment-intent/payment-intent.module';

// gRPC module
import { GrpcModule } from '@/grpc/grpc.module';
import { EventsModule } from '@/events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentTransaction,
      PaymentIntent,
      TSPConfiguration,
    ]),
    forwardRef(() => PaymentIntentModule),
    GrpcModule,
    EventsModule,
  ],
  controllers: [PaymentTransactionController],
  providers: [PaymentTransactionService],
  exports: [PaymentTransactionService],
})
export class PaymentTransactionModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentStatusGateway } from './payment-status.gateway';
import { PaymentStatusSSEController } from './payment-status-sse.controller';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentIntent, PaymentTransaction]),
  ],
  controllers: [PaymentStatusSSEController],
  providers: [PaymentStatusGateway],
  exports: [PaymentStatusGateway],
})
export class PaymentStatusModule {}


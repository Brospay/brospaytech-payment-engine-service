import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { CommonModule } from '@/common/common.module';
import { GrpcModule } from '@/grpc/grpc.module';
import { CustomerResolutionModule } from '@/modules/customer-resolution/customer-resolution.module';
import { FraudManagementService } from './fraud-management.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentTransaction]),
    CommonModule,
    GrpcModule,
    CustomerResolutionModule, // Import customer resolution for proper architecture
  ],
  providers: [FraudManagementService],
  exports: [FraudManagementService],
})
export class FraudModule {}

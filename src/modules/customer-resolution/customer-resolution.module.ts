import { Module } from '@nestjs/common';
import { CustomerResolutionService } from './customer-resolution.service';
import { CommonModule } from '@/common/common.module';
import { GrpcModule } from '@/grpc/grpc.module';

/**
 * Customer Resolution Module
 * Handles customer information resolution for payment processing
 */
@Module({
  imports: [
    CommonModule, // For LoggerService
    GrpcModule,   // For Merchant Service gRPC client
  ],
  providers: [CustomerResolutionService],
  exports: [CustomerResolutionService],
})
export class CustomerResolutionModule {}





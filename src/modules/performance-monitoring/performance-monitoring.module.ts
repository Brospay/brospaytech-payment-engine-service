import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Entities
import { TSPPerformanceMetrics } from '@/entities/tsp-performance-metrics.entity';
import { BankPerformanceMetrics } from '@/entities/bank-performance-metrics.entity';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';

// Services
import { CommonModule } from '@/common/common.module';
import { PerformanceMonitoringService } from './performance-monitoring.service';
import { PerformanceMonitoringController } from './performance-monitoring.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TSPPerformanceMetrics,
      BankPerformanceMetrics,
      PaymentTransaction,
      TSPConfiguration,
    ]),
    ScheduleModule.forRoot(),
    CommonModule,
  ],
  providers: [PerformanceMonitoringService],
  controllers: [PerformanceMonitoringController],
  exports: [PerformanceMonitoringService],
})
export class PerformanceMonitoringModule {}
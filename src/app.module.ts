import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';

// Configuration imports
import { validate } from './config/environment.config';
import { getDatabaseConfig } from './config/database.config';

// Module imports
import { HealthModule } from './modules/health/health.module';
import { PaymentIntentModule } from './modules/payment-intent/payment-intent.module';
import { PaymentTransactionModule } from './modules/payment-transaction/payment-transaction.module';
import { PayoutModule } from './modules/payout/payout.module';
import { BatchPayoutModule } from './modules/batch-payout/batch-payout.module';
import { RefundModule } from './modules/refund/refund.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { TSPManagementModule } from './modules/tsp-management/tsp-management.module';
import { SmartRoutingModule } from './modules/smart-routing/smart-routing.module';
import { PerformanceMonitoringModule } from './modules/performance-monitoring/performance-monitoring.module';
import { PaymentStatusModule } from './modules/payment-status/payment-status.module';
import { TSPModule } from './tsp/tsp.module';
import { FraudModule } from './fraud/fraud.module';
import { WebhookModule } from './webhooks/webhook.module';
import { SettlementWebhookModule } from './webhooks/settlement/settlement-webhook.module';

// Common modules
import { CommonModule } from './common/common.module';
import { GrpcModule } from './grpc/grpc.module';
import { EventsModule } from './events/events.module';

// Security imports
import { CombinedAuthGuard } from './common/guards/combined-auth.guard';
import { InternalServiceGuard } from './common/guards/internal-service.guard';

@Module({
  imports: [
    // Configuration module with validation
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env'
      ],
      validate,
      cache: true,
      expandVariables: true,
    }),

    // TypeORM module with high-performance configuration
    TypeOrmModule.forRootAsync({
      useFactory: getDatabaseConfig,
    }),

    // Core application modules
    CommonModule,
    GrpcModule,
    EventsModule,
    HealthModule,
    PaymentIntentModule,
    PaymentTransactionModule,
    PayoutModule,
    BatchPayoutModule,
    RefundModule,
    SettlementModule,
    TSPManagementModule,
    SmartRoutingModule,
    PerformanceMonitoringModule,
    PaymentStatusModule,
    TSPModule,
    FraudModule,
    WebhookModule,
    SettlementWebhookModule,
  ],
  controllers: [],
  providers: [
    // Global internal service authentication guard
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
    // Make guards available for dependency injection
    CombinedAuthGuard,
    InternalServiceGuard,
  ],
})
export class AppModule {
  constructor() {
    console.log('Valorapays Payment Engine Module Initialized');
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Database: ${process.env.DATABASE_NAME}`);
    console.log(`Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  }
}
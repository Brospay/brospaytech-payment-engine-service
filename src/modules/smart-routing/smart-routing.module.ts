import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmartRoutingController } from './smart-routing.controller';
import { SmartRoutingService } from './smart-routing.service';
import { RoutingFactorsService } from './routing-factors.service';

// Entity imports
import { TSPRoutingRule } from '@/entities/tsp-routing-rule.entity';
import { TSPRoutingOverride } from '@/entities/tsp-routing-override.entity';
import { TSPPerformanceMetrics } from '@/entities/tsp-performance-metrics.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { BankPerformanceMetrics } from '@/entities/bank-performance-metrics.entity';

// Common modules
import { CommonModule } from '@/common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TSPRoutingRule,
      TSPRoutingOverride,
      TSPPerformanceMetrics,
      TSPConfiguration,
      BankPerformanceMetrics,
    ]),
    CommonModule,
  ],
  controllers: [SmartRoutingController],
  providers: [SmartRoutingService, RoutingFactorsService],
  exports: [SmartRoutingService, RoutingFactorsService],
})
export class SmartRoutingModule {}

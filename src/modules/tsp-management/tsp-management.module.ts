import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TSPManagementController } from './tsp-management.controller';
import { TSPManagementService } from './tsp-management.service';

// Entity imports
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { TSPPerformanceMetrics } from '@/entities/tsp-performance-metrics.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TSPConfiguration,
      TSPPerformanceMetrics,
    ]),
  ],
  controllers: [TSPManagementController],
  providers: [TSPManagementService],
  exports: [TSPManagementService],
})
export class TSPManagementModule {}

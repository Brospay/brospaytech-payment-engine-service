import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { CommonModule } from '@/common/common.module';
import { TSPFactoryService } from './tsp-factory.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TSPConfiguration]),
    CommonModule,
  ],
  providers: [TSPFactoryService],
  exports: [TSPFactoryService],
})
export class TSPModule {}

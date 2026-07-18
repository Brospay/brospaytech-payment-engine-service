import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchPayoutService } from './batch-payout.service';
import { BatchPayoutGrpcController } from './batch-payout-grpc.controller';
import { BatchPayout } from '../../entities/batch-payout.entity';
import { Payout } from '../../entities/payout.entity';
import { BatchPayoutParserService } from '../../services/batch-payout-parser.service';
import { GrpcModule } from '../../grpc/grpc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BatchPayout, Payout]),
    GrpcModule,
  ],
  controllers: [BatchPayoutGrpcController],
  providers: [
    BatchPayoutService,
    BatchPayoutParserService,
  ],
  exports: [BatchPayoutService],
})
export class BatchPayoutModule {}



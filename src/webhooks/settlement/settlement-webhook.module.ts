import { Module } from '@nestjs/common';
import { SettlementWebhookController } from './settlement-webhook.controller';
import { SettlementWebhookService } from './settlement-webhook.service';
import { GrpcModule } from '../../grpc/grpc.module';

@Module({
  imports: [GrpcModule],
  controllers: [SettlementWebhookController],
  providers: [SettlementWebhookService],
  exports: [SettlementWebhookService]
})
export class SettlementWebhookModule {}


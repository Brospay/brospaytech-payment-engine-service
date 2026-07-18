import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { BatchPayoutService } from './batch-payout.service';

@Controller()
export class BatchPayoutGrpcController {
  private readonly logger = new Logger(BatchPayoutGrpcController.name);

  constructor(private readonly batchPayoutService: BatchPayoutService) {}

  @GrpcMethod('PaymentEngineService', 'UploadBatchPayout')
  async uploadBatchPayout(data: {
    merchant_id: string;
    file_content: Buffer;
    file_name: string;
    file_type: string;
    webhook_url?: string;
    request_id: string;
  }) {
    try {
      const result = await this.batchPayoutService.uploadBatchPayout(data);
      return result;
    } catch (error) {
      this.logger.error(`gRPC UploadBatchPayout failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
        validation_errors: [],
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'ConfirmBatchPayout')
  async confirmBatchPayout(data: {
    merchant_id: string;
    batch_id: string;
    request_id: string;
  }) {
    try {
      const result = await this.batchPayoutService.confirmBatchPayout(data);
      return result;
    } catch (error) {
      this.logger.error(`gRPC ConfirmBatchPayout failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetBatchPayoutStatus')
  async getBatchPayoutStatus(data: {
    merchant_id: string;
    batch_id: string;
    request_id: string;
  }) {
    try {
      const result = await this.batchPayoutService.getBatchStatus(data);
      return result;
    } catch (error) {
      this.logger.error(`gRPC GetBatchPayoutStatus failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'ListBatchPayouts')
  async listBatchPayouts(data: {
    merchant_id: string;
    page: number;
    limit: number;
    status?: string;
    from_date?: string;
    to_date?: string;
    request_id: string;
  }) {
    try {
      const result = await this.batchPayoutService.listBatches(data);
      return result;
    } catch (error) {
      this.logger.error(`gRPC ListBatchPayouts failed: ${error.message}`);
      return {
        success: false,
        batches: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetBatchPayouts')
  async getBatchPayouts(data: {
    merchant_id: string;
    batch_id: string;
    page: number;
    limit: number;
    status?: string;
    request_id: string;
  }) {
    try {
      const result = await this.batchPayoutService.getBatchPayouts(data);
      return result;
    } catch (error) {
      this.logger.error(`gRPC GetBatchPayouts failed: ${error.message}`);
      return {
        success: false,
        payouts: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }
  }
}



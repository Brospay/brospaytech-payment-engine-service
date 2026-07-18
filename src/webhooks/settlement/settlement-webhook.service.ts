import { Injectable, Logger, HttpException, HttpStatus, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import * as crypto from 'crypto';

interface SettlementWebhookPayload {
  transactionId?: string;
  merchantReference?: string;
  referenceId?: string;
  status: string;
  amount?: number;
  completedAt?: string;
  failedAt?: string;
  failureReason?: string;
  bankReferenceNumber?: string;
  utr?: string;
}

interface UpdateSettlementStatusResponse {
  success: boolean;
  settlement_id: string;
  status: string;
  amount: number;
  merchant_id: string;
  message: string;
  error_message?: string;
}

interface WalletServiceGrpc {
  updateSettlementStatus(data: any): any;
}

@Injectable()
export class SettlementWebhookService implements OnModuleInit {
  private readonly logger = new Logger(SettlementWebhookService.name);
  private walletService: WalletServiceGrpc;

  constructor(
    @Inject('WALLET_SERVICE') private readonly walletClient: ClientGrpc
  ) {}

  onModuleInit() {
    this.walletService = this.walletClient.getService<WalletServiceGrpc>('WalletService');
  }

  async handlePaytaraWebhook(
    payload: SettlementWebhookPayload,
    signature: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log('Processing Paytara settlement webhook', {
        referenceId: payload.merchantReference || payload.referenceId,
        status: payload.status
      });

      const isValid = this.verifyPaytaraSignature(payload, signature);
      if (!isValid) {
        throw new HttpException(
          'Invalid webhook signature',
          HttpStatus.UNAUTHORIZED
        );
      }

      const settlementId = payload.merchantReference || payload.referenceId;
      if (!settlementId) {
        throw new HttpException(
          'Missing settlement reference ID',
          HttpStatus.BAD_REQUEST
        );
      }

      const mappedStatus = this.mapPaytaraStatus(payload.status);

      await this.processSettlementStatusUpdate(
        settlementId,
        mappedStatus,
        {
          tspProvider: 'paytara',
          externalTransactionId: payload.transactionId,
          bankReferenceNumber: payload.bankReferenceNumber,
          utr: payload.utr,
          completedAt: payload.completedAt || payload.failedAt,
          failureReason: payload.failureReason
        }
      );

      this.logger.log('Paytara webhook processed successfully', {
        settlementId,
        status: mappedStatus
      });

      return {
        success: true,
        message: 'Webhook processed successfully'
      };

    } catch (error) {
      this.logger.error(`Paytara webhook processing failed: ${error.message}`, {
        error: error.stack,
        payload
      });
      throw error;
    }
  }

  async handleKingdomBankWebhook(
    payload: SettlementWebhookPayload,
    signature: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log('Processing Kingdom Bank settlement webhook', {
        referenceId: payload.referenceId,
        status: payload.status
      });

      const isValid = this.verifyKingdomBankSignature(payload, signature);
      if (!isValid) {
        throw new HttpException(
          'Invalid webhook signature',
          HttpStatus.UNAUTHORIZED
        );
      }

      const settlementId = payload.referenceId;
      if (!settlementId) {
        throw new HttpException(
          'Missing settlement reference ID',
          HttpStatus.BAD_REQUEST
        );
      }

      const mappedStatus = this.mapKingdomBankStatus(payload.status);

      await this.processSettlementStatusUpdate(
        settlementId,
        mappedStatus,
        {
          tspProvider: 'kingdom_bank',
          externalTransactionId: payload.transactionId,
          bankReferenceNumber: payload.bankReferenceNumber,
          utr: payload.utr,
          completedAt: payload.completedAt || payload.failedAt,
          failureReason: payload.failureReason
        }
      );

      this.logger.log('Kingdom Bank webhook processed successfully', {
        settlementId,
        status: mappedStatus
      });

      return {
        success: true,
        message: 'Webhook processed successfully'
      };

    } catch (error) {
      this.logger.error(`Kingdom Bank webhook processing failed: ${error.message}`, {
        error: error.stack,
        payload
      });
      throw error;
    }
  }

  private async processSettlementStatusUpdate(
    settlementId: string,
    status: string,
    metadata: {
      tspProvider: string;
      externalTransactionId?: string;
      bankReferenceNumber?: string;
      utr?: string;
      completedAt?: string;
      failureReason?: string;
    }
  ): Promise<void> {
    try {
      this.logger.log(`Updating settlement status via Wallet Service: ${settlementId} -> ${status}`, {
        settlementId,
        status,
        tspProvider: metadata.tspProvider
      });

      const updateRequest = {
        settlement_id: settlementId,
        status,
        tsp_provider: metadata.tspProvider,
        external_transaction_id: metadata.externalTransactionId,
        bank_reference_number: metadata.bankReferenceNumber,
        utr: metadata.utr,
        completed_at: metadata.completedAt,
        failure_reason: metadata.failureReason,
        metadata: {},
        request_id: `webhook_${Date.now()}`
      };

      const response = await lastValueFrom(
        this.walletService.updateSettlementStatus(updateRequest)
      ) as UpdateSettlementStatusResponse;

      if (response.success) {
        this.logger.log(`Settlement status updated successfully via Wallet Service`, {
          settlementId,
          status,
          merchantId: response.merchant_id,
          amount: response.amount
        });
      } else {
        throw new Error(response.error_message || 'Wallet Service update failed');
      }

    } catch (error) {
      this.logger.error(`Failed to update settlement status: ${error.message}`, {
        settlementId,
        error: error.stack
      });
      throw error;
    }
  }

  private verifyPaytaraSignature(payload: any, signature: string): boolean {
    try {
      const secret = process.env.PAYTARA_WEBHOOK_SECRET || 'paytara_secret_key';
      const payloadString = JSON.stringify(payload);
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
    }
  }

  private verifyKingdomBankSignature(payload: any, signature: string): boolean {
    try {
      const secret = process.env.KINGDOM_BANK_WEBHOOK_SECRET || 'kingdom_bank_secret';
      const payloadString = JSON.stringify(payload);
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
    }
  }

  private mapPaytaraStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'PENDING': 'PROCESSING',
      'IN_PROGRESS': 'PROCESSING',
      'PROCESSING': 'PROCESSING',
      'SUCCESS': 'COMPLETED',
      'COMPLETED': 'COMPLETED',
      'SETTLED': 'COMPLETED',
      'FAILED': 'FAILED',
      'REJECTED': 'FAILED',
      'CANCELLED': 'CANCELLED'
    };

    return statusMap[status.toUpperCase()] || 'PROCESSING';
  }

  private mapKingdomBankStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'INITIATED': 'PROCESSING',
      'PROCESSING': 'PROCESSING',
      'SUCCESS': 'COMPLETED',
      'COMPLETED': 'COMPLETED',
      'FAILED': 'FAILED',
      'DECLINED': 'FAILED',
      'TIMEOUT': 'FAILED'
    };

    return statusMap[status.toUpperCase()] || 'PROCESSING';
  }
}


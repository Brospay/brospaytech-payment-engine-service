import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { LoggerService } from '@/common/services/logger.service';
import { ResponseCodeManager } from '@/common/response-codes';
import { CommunicationServiceClient } from '@/grpc/communication-service.client';
import { 
  MerchantWebhookPayload, 
  MerchantWebhookEventType,
} from '@/types';

/**
 * Merchant Webhook Delivery Service
 * 
 * Delegates webhook delivery to Communication Service
 * Communication Service handles:
 * - Webhook endpoint management
 * - Signature generation
 * - Retry mechanism
 * - Delivery tracking
 */
@Injectable()
export class MerchantWebhookService {
  private readonly logger = new Logger(MerchantWebhookService.name);

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,

    @InjectRepository(PaymentIntent)
    private readonly paymentIntentRepo: Repository<PaymentIntent>,

    private readonly loggerService: LoggerService,
    private readonly communicationServiceClient: CommunicationServiceClient,
  ) {}

  /**
   * Deliver webhook to merchant after payment status change
   * Delegates to Communication Service which handles:
   * - Webhook endpoint lookup
   * - Signature generation
   * - Retry mechanism
   * - Delivery tracking
   */
  async deliverMerchantWebhook(
    transaction: PaymentTransaction, 
    eventType: MerchantWebhookEventType,
    requestId: string
  ): Promise<boolean> {
    try {
      this.logger.log(`[${requestId}] Delegating webhook delivery to Communication Service for transaction: ${transaction.transactionId}`);

      const intent = await this.paymentIntentRepo.findOne({
        where: { intentId: transaction.paymentIntentId },
      });

      if (!intent) {
        this.logger.error(`[${requestId}] Payment intent not found for transaction: ${transaction.transactionId}`);
        return false;
      }

      const standardEventType = this.mapToStandardEventType(eventType);

      const webhookData = {
        event_type: standardEventType,
        payment_data: {
          merchant_id: transaction.merchantId,
          payment_id: intent.intentId,
          transaction_id: transaction.transactionId,
          order_id: intent.intentId, 
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          payment_method: transaction.paymentMethod,
          processed_at: new Date().toISOString(),
          failure_reason: transaction.status === 'failed' 
            ? ResponseCodeManager.getCustomerMessage(transaction.responseCode)
            : undefined,
        },
        merchant_webhook_url: undefined, 
      };

      const result = await this.communicationServiceClient.createWebhookDelivery(webhookData);

      if (result?.success) {
        this.logger.log(`[${requestId}] Webhook delivery queued successfully: ${result.delivery_id}`);
        return true;
      } else {
        this.logger.error(`[${requestId}] Failed to queue webhook delivery: ${result?.message || 'Unknown error'}`);
        return false;
      }

    } catch (error) {
      this.logger.error(`[${requestId}] Merchant webhook delivery failed:`, error.stack);
      return false;
    }
  }

  /**
   * Map merchant webhook event type to Communication Service event type
   */
  private mapToStandardEventType(eventType: MerchantWebhookEventType): string {
    const eventMap: Record<string, string> = {
      'payment.success': 'payment.succeeded',
      'payment.completed': 'payment.succeeded',
      'payment.failed': 'payment.failed',
      'payment.pending': 'payment.pending',
      'payment.cancelled': 'payment.cancelled',
    };

    return eventMap[eventType] || eventType;
  }
}

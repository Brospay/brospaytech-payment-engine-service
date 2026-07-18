import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@/common/guards/combined-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { MerchantWebhookService } from './merchant/merchant-webhook.service';
import { LoggerService } from '@/common/services/logger.service';

@ApiTags('Webhook Testing')
@Controller('webhook-test')
@Public()
export class WebhookTestController {
  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,

    @InjectRepository(PaymentIntent)
    private readonly intentRepo: Repository<PaymentIntent>,

    private readonly merchantWebhookService: MerchantWebhookService,
    private readonly logger: LoggerService,
  ) {}

  @Post('trigger')
  @ApiOperation({ 
    summary: 'Trigger test merchant webhook delivery',
    description: 'Creates a test transaction and triggers webhook delivery to test merchant endpoint configuration'
  })
  @ApiResponse({ status: 200, description: 'Webhook triggered successfully' })
  async triggerTestWebhook(
    @Body() testData: {
      merchantId: string;
      eventType: 'payment.success' | 'payment.failed' | 'payment.pending' | 'payment.cancelled';
      amount?: number;
      currency?: string;
      transactionId?: string;
    }
  ) {
    try {
    //   this.logger.log(`Triggering test webhook for merchant: ${testData.merchantId}, event: ${testData.eventType}`);

    //   let transaction: PaymentTransaction;
    //   let intent: PaymentIntent;

    //   if (testData.transactionId) {
    //     transaction = await this.transactionRepo.findOne({
    //       where: { transactionId: testData.transactionId },
    //       relations: ['intent'],
    //     });

    //     if (!transaction) {
    //       return {
    //         success: false,
    //         message: `Transaction not found: ${testData.transactionId}`,
    //       };
    //     }

    //     intent = transaction.intent;
    //   } else {
    //     const testIntentId = `test_intent_${Date.now()}`;
    //     const testTransactionId = `test_txn_${Date.now()}`;

    //     intent = this.intentRepo.create({
    //       intentId: testIntentId,
    //       merchantId: testData.merchantId,
    //       amount: testData.amount || 100.00,
    //       currency: testData.currency || 'INR',
    //       status: 'succeeded',
    //       customerEmail: 'test@example.com',
    //       customerName: 'Test Customer',
    //       requestId: `test_req_${Date.now()}`,
    //     });
    //     await this.intentRepo.save(intent);

    //     transaction = this.transactionRepo.create({
    //       transactionId: testTransactionId,
    //       paymentIntentId: testIntentId,
    //       merchantId: testData.merchantId,
    //       amount: testData.amount || 100.00,
    //       currency: testData.currency || 'INR',
    //       status: testData.eventType === 'payment.success' ? 'success' : 'failed',
    //       tspProvider: 'test_provider',
    //       responseCode: testData.eventType === 'payment.success' ? '0' : '1009',
    //       responseType: testData.eventType === 'payment.success' ? 'SUCCESS' : 'FAILED',
    //       statusDescription: `Test ${testData.eventType}`,
    //       attemptNumber: 1,
    //       requestId: `test_req_${Date.now()}`,
    //       environment: 'sandbox',
    //     });
    //     await this.transactionRepo.save(transaction);
    //   }

    //   const requestId = `webhook_test_${Date.now()}`;
    //   const delivered = await this.merchantWebhookService.deliverMerchantWebhook(
    //     transaction,
    //     testData.eventType as any,
    //     requestId
    //   );

      return {
        success: true,
        message: 'Webhook delivery initiated',
        data: {
        //   webhookDelivered: delivered,
        //   transactionId: transaction.transactionId,
        //   intentId: intent.intentId,
        //   merchantId: testData.merchantId,
        //   eventType: testData.eventType,
        //   requestId,
        },
      };

    } catch (error) {
      this.logger.error('Test webhook trigger failed:', error);
      return {
        success: false,
        message: `Webhook trigger failed: ${error.message}`,
        error: error.message,
      };
    }
  }

  @Get('events/:merchantId')
  @ApiOperation({ 
    summary: 'Get webhook events for merchant',
    description: 'Returns list of webhook events and their delivery status'
  })
  async getWebhookEvents(@Param('merchantId') merchantId: string) {
    try {
      const transactions = await this.transactionRepo.find({
        where: { merchantId },
        order: { createdAt: 'DESC' },
        take: 20,
      });

      return {
        success: true,
        data: {
          merchantId,
          totalTransactions: transactions.length,
          transactions: transactions.map(t => ({
            transactionId: t.transactionId,
            intentId: t.paymentIntentId,
            amount: t.amount,
            currency: t.currency,
            status: t.status,
            tspProvider: t.tspProvider,
            createdAt: t.createdAt,
          })),
        },
      };
    } catch (error) {
      this.logger.error('Failed to get webhook events:', error);
      return {
        success: false,
        message: `Failed to get events: ${error.message}`,
      };
    }
  }

  @Get('info')
  @ApiOperation({ 
    summary: 'Get webhook system information',
    description: 'Returns information about webhook delivery system configuration'
  })
  async getWebhookInfo() {
    return {
      success: true,
      data: {
        supportedEvents: [
          'payment.success',
          'payment.failed',
          'payment.pending',
          'payment.cancelled',
          'payout.completed',
          'payout.failed',
          'refund.completed',
        ],
        retryPolicy: {
          maxAttempts: 3,
          backoffStrategy: 'exponential',
          baseDelayMs: 60000,
          successCriteria: 'HTTP 200-299 response',
        },
        communicationService: {
          handles: [
            'Webhook endpoint management',
            'Signature generation',
            'Retry mechanism',
            'Delivery tracking',
          ],
          stopRetryingWhen: [
            'HTTP 200-299 received',
            'Max attempts (3) reached',
            'Webhook expires',
          ],
        },
        payloadFormat: {
          event_type: 'string',
          payment_data: {
            merchant_id: 'string',
            payment_id: 'string',
            transaction_id: 'string',
            order_id: 'string',
            amount: 'number',
            currency: 'string',
            status: 'string',
            payment_method: 'string',
            processed_at: 'ISO string',
            failure_reason: 'string (optional)',
          },
        },
      },
    };
  }
}


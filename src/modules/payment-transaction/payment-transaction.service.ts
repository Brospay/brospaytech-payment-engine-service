import { Injectable, Logger, NotFoundException, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SelectQueryBuilder, Repository } from 'typeorm';
import { ClientGrpc } from '@nestjs/microservices';

// Entity imports
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';

// Service imports
import { LoggerService } from '@/common/services/logger.service';
import { ResponseCodeManager } from '@/common/response-codes';
import { AuthenticatedGrpcService } from '@/grpc/authenticated-grpc.service';
import { CommunicationServiceClient } from '@/grpc/communication-service.client';
import { WalletServiceGrpc, PaymentNotificationData, WebhookDeliveryData } from '@/types';
import { KafkaProducerService } from '@/events/kafka-producer.service';
import { TransactionEvent, PaymentStatusEvent } from '@/events/types/event.types';
import { filter } from 'compression';
import { ComparisonMetrics, TimeSeriesPoint, TransactionAnalyticsFilters, TransactionSummary } from './types/all.types';
import { PaymentIntentService } from '@/modules/payment-intent/payment-intent.service';
import { CreatePaymentIntentRequest } from '@/types/payment-intent.types';
import { SortColumns } from './enums/sort-columns.enum';
import { SortDirection } from './enums/sort-direction.enum';

@Injectable()
export class PaymentTransactionService implements OnModuleInit {
  private readonly logger = new Logger(PaymentTransactionService.name);
  private walletService: WalletServiceGrpc;

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepository: Repository<PaymentTransaction>,
    @InjectRepository(PaymentIntent)
    private readonly intentRepository: Repository<PaymentIntent>,
    private readonly loggerService: LoggerService,
    
    @Inject('WALLET_SERVICE') 
    private readonly walletGrpcClient: ClientGrpc,
    
    private readonly authenticatedGrpc: AuthenticatedGrpcService,
    private readonly communicationService: CommunicationServiceClient,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly paymentIntentService: PaymentIntentService,
  ) {}

  onModuleInit() {
    this.walletService = this.authenticatedGrpc.wrapGrpcClient<WalletServiceGrpc>(
      this.walletGrpcClient,
      'WalletService',
      'wallet-service'
    );
  }

  private async publishTransactionCreatedEvent(
    transaction: PaymentTransaction,
    intent: PaymentIntent
  ): Promise<void> {
    const metadata = intent.metadata || {};
    
    const event: TransactionEvent = {
      eventId: `txn_event_${transaction.id}_${Date.now()}`,
      eventType: 'transaction.created',
      timestamp: new Date().toISOString(),
      source: 'payment-engine',
      version: '1.0',
      transactionId: transaction.transactionId,
      merchantId: intent.merchantId.toString(),
      customerId: intent.customerId || intent.customerEmail,
      data: {
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod || 'unknown',
        tspProvider: transaction.tspProvider,
        processingTimeMs: 0,
        customerEmail: intent.customerEmail,
        customerPhone: intent.customerPhone,
        customerName: metadata.customerName || metadata.customer_name,
        customerIp: intent.clientIpAddress || metadata.customerIp || metadata.customer_ip,
        customerCountry: metadata.customerCountry || metadata.customer_country || metadata.country,
        customerCity: metadata.customerCity || metadata.customer_city || metadata.city,
        customerState: metadata.customerState || metadata.customer_state || metadata.state,
        userAgent: intent.userAgent,
        metadata: {
          intentId: intent.intentId,
          orderId: intent.description,
          environment: transaction.environment,
          ...metadata,
        },
      },
    };

    await this.kafkaProducer.publishTransactionEvent(event);
  }

  private async publishPaymentStatusEvent(
    transaction: PaymentTransaction,
    intent: PaymentIntent,
    eventType: 'payment.processing' | 'payment.succeeded' | 'payment.failed',
    previousStatus?: string,
    processingTimeMs?: number
  ): Promise<void> {
    const metadata = intent.metadata || {};
    
    const event: PaymentStatusEvent = {
      eventId: `pay_event_${transaction.id}_${Date.now()}`,
      eventType,
      timestamp: new Date().toISOString(),
      source: 'payment-engine',
      version: '1.0',
      transactionId: transaction.transactionId,
      merchantId: intent.merchantId.toString(),
      customerId: intent.customerId || intent.customerEmail,
      data: {
        status: transaction.status,
        previousStatus,
        errorCode: transaction.responseCode,
        errorMessage: transaction.errorMessage || transaction.statusDescription,
        processingTimeMs,
        amount: transaction.amount,
        currency: transaction.currency,
        paymentMethod: transaction.paymentMethod || 'unknown',
        paymentMode: metadata.paymentMode || metadata.payment_mode || 'online',
        
        // TSP/Gateway details
        tspProvider: transaction.tspProvider,
        tspTransactionId: transaction.externalTransactionId || metadata.tspTransactionId,
        bankCode: metadata.bankCode || metadata.bank_code,
        binNumber: metadata.binNumber || metadata.cardBin || metadata.bin_number,
        
        // Fee breakdown
        platformFee: metadata.platformFee || metadata.platform_fee || 0,
        gatewayFee: metadata.gatewayFee || metadata.gateway_fee || 0,
        taxes: metadata.taxes || metadata.gst || 0,
        
        // Customer details
        customerEmail: intent.customerEmail,
        customerPhone: intent.customerPhone,
        customerName: metadata.customerName || metadata.customer_name,
        customerId: intent.customerId,
        
        // Geographic data
        customerIp: intent.clientIpAddress || metadata.customerIp || metadata.customer_ip,
        customerCountry: metadata.customerCountry || metadata.customer_country || metadata.country,
        customerCity: metadata.customerCity || metadata.customer_city || metadata.city,
        customerState: metadata.customerState || metadata.customer_state || metadata.state,
        country: metadata.customerCountry || metadata.customer_country || metadata.country,
        
        // Device/Browser data
        userAgent: intent.userAgent,
        deviceType: metadata.deviceType || this.detectDeviceType(intent.userAgent),
        
        // Risk & Fraud data
        riskScore: metadata.riskScore || metadata.risk_score || 0,
        fraudScore: metadata.fraudScore || metadata.fraud_score || 0,
        isHighRisk: (metadata.riskScore || metadata.risk_score || 0) > 50,
        
        // International payment flag
        isInternational: transaction.currency !== 'INR' || metadata.isInternational,
        
        // Settlement data
        settlementId: metadata.settlementId,
        isSettled: metadata.isSettled || false,
        settledAt: metadata.settledAt,
        
        // Refund data
        refundId: metadata.refundId,
        refundAmount: metadata.refundAmount,
        isRefunded: metadata.isRefunded || false,
        refundedAt: metadata.refundedAt,
        
        // Webhook data
        webhookUrl: intent.webhookUrl || metadata.webhookUrl,
        webhookDelivered: metadata.webhookDelivered || false,
        webhookAttempts: metadata.webhookAttempts || 0,
        successUrl: metadata.successUrl || metadata.success_url,
        cancelUrl: metadata.cancelUrl || metadata.cancel_url,
        
        // Full metadata for extensibility
        metadata: {
          intentId: intent.intentId,
          orderId: intent.description || metadata.orderId,
          environment: transaction.environment,
          ...metadata,
        },
      },
    };

    await this.kafkaProducer.publishPaymentStatusEvent(event);
  }

  /**
   * Detect device type from user agent string
   */
  private detectDeviceType(userAgent?: string): string {
    if (!userAgent) return 'OTHER';
    
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'MOBILE';
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'TABLET';
    }
    if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) {
      return 'DESKTOP';
    }
    
    return 'OTHER';
  }

  /**
   * Create new transaction attempt for a payment intent
   */
  async createTransaction(
    intentId: string,
    tspProvider: string,
    attemptNumber: number,
    requestId: string,
    externalTransactionId?: string,
    customerDetails?: {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
    }
  ): Promise<PaymentTransaction> {
    try {
      const intent = await this.intentRepository.findOne({
        where: { intentId }
      });

      if (!intent) {
        throw new NotFoundException('Payment intent not found');
      }

      const transactionId = this.generateTransactionId(intentId, attemptNumber);

      const transaction = this.transactionRepository.create({
        transactionId,
        paymentIntentId: intentId,
        merchantId: intent.merchantId,
        customerName: customerDetails?.customerName || intent.customerName,
        customerEmail: customerDetails?.customerEmail || intent.customerEmail,
        customerPhone: customerDetails?.customerPhone || intent.customerPhone,
        attemptNumber,
        tspProvider,
        amount: intent.amount,
        currency: intent.currency,
        status: 'initiated',
        responseCode: '1088',
        responseType: 'PENDING',
        statusDescription: 'Transaction initiated',
        isFinalStatus: false,
        requiresFollowup: true,
        settlementEligible: false,
        requestId,
        environment: intent.environment,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        externalTransactionId: externalTransactionId || transactionId,
        paymentMethod: intent.preferredPaymentMethod || 'CARD',
      });

      const savedTransaction = await this.transactionRepository.save(transaction);

      this.publishTransactionCreatedEvent(savedTransaction, intent)
        .then(() => this.logger.log(`Transaction event published: ${savedTransaction.transactionId}`))
        .catch(error => this.logger.error(`Failed to publish transaction created event: ${error.message}`));

      return savedTransaction;
    } catch (error) {
      this.logger.error(`[${requestId}] Failed to create transaction:`, error.stack);
      throw error;
    }
  }

  /**
   * Create transaction for merchant (creates payment intent and transaction)
   */
  async createTransactionForMerchant(request: {
    merchantId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    orderId?: string;
    description?: string;
    requestId: string;
    environment?: string;
    metadata?: Record<string, any>;
  }): Promise<{
    transaction: PaymentTransaction;
    intent: PaymentIntent;
    paymentUrl?: string;
  }> {
    try {
      console.log("Currency from frontend", request.currency);

      this.logger.log(`[${request.requestId}] Creating transaction for merchant: ${request.merchantId}, amount: ${request.amount}`);

      const nameParts = request.customerName?.split(' ') || [];
      const customerFirstName = nameParts[0] || request.customerName;
      const customerLastName = nameParts.slice(1).join(' ') || '';

      const metadata = {
        ...request.metadata,
        orderId: request.orderId,
        customerName: request.customerName,
      };

      const paymentIntentRequest: CreatePaymentIntentRequest = {
        merchantId: request.merchantId,
        customerEmail: request.customerEmail,
        customerPhone: request.customerPhone,
        customerFirstName,
        customerLastName,
        amount: request.amount,
        currency: request.currency as any,
        paymentMethod: request.paymentMethod,
        description: request.description || request.orderId || 'Transaction',
        metadata,
        requestId: request.requestId,
      };

      const intentResponse = await this.paymentIntentService.createPaymentIntent(paymentIntentRequest);

      const intent = await this.intentRepository.findOne({
        where: { intentId: intentResponse.intentId }
      });

      if (!intent) {
        throw new NotFoundException(`Payment intent not found: ${intentResponse.intentId}`);
      }

      // TODO: Swapnil Will Use the routing decision from the intent to determine TSP provider

      const tspProvider = 'razorpay'; 
      
      const transaction = await this.createTransaction(
        intentResponse.intentId,
        tspProvider,
      1, // TODO: Swapnil Will Use the attempt number from the intent to determine the attempt number
        request.requestId,
        undefined,
        {
          customerName: request.customerName,
          customerEmail: request.customerEmail,
          customerPhone: request.customerPhone,
        }
      );

      const paymentUrl = intentResponse.paymentPageUrl;

      this.logger.log(`[${request.requestId}] Transaction created successfully: ${transaction.transactionId} for intent: ${intentResponse.intentId}`);

      return {
        transaction,
        intent,
        paymentUrl,
      };
    } catch (error) {
      this.logger.error(`[${request.requestId}] Failed to create transaction for merchant:`, error.stack);
      throw error;
    }
  }

  /**
   * Update transaction status with response code
   */
  async updateTransactionStatus(
    transactionId: string,
    responseCode: string,
    tspResponse?: any,
    requestId?: string
  ): Promise<PaymentTransaction> {
    try {
      const transaction = await this.transactionRepository.findOne({
        where: { transactionId },
        relations: ['intent']
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }


      const codeInfo = ResponseCodeManager.getResponseCodeInfo(responseCode);
      if (!codeInfo) {
        throw new Error(`Unknown response code: ${responseCode}`);
      }
      // Update transaction with response code
      transaction.responseCode = responseCode;
      transaction.responseType = codeInfo.type as any;
      transaction.statusDescription = codeInfo.description;
      transaction.isFinalStatus = codeInfo.isFinalStatus;
      transaction.requiresFollowup = codeInfo.requiresFollowup;
      transaction.settlementEligible = codeInfo.affectsSettlement;
      transaction.tspResponse = tspResponse;

      transaction.status = this.mapResponseTypeToTransactionStatus(codeInfo.type);

      if (codeInfo.isFinalStatus) {
        switch (codeInfo.type) {
          case 'SUCCESS':
            transaction.completedAt = new Date();
            break;
          case 'FAILED':
            transaction.failedAt = new Date();
            break;
          case 'TIMEOUT':
            transaction.timedOutAt = new Date();
            break;
          case 'ABANDONED':
            transaction.abandonedAt = new Date();
            break;
        }
      }

      const previousStatus = transaction.status;
      const updatedTransaction = await this.transactionRepository.save(transaction);


      await this.updatePaymentIntentFromTransaction(updatedTransaction, requestId);

      // Publish payment status event for analytics
      if (codeInfo.isFinalStatus && updatedTransaction.intent) {
        let eventType: 'payment.processing' | 'payment.succeeded' | 'payment.failed';
        
        if (codeInfo.type === 'SUCCESS') {
          eventType = 'payment.succeeded';
        } else if (codeInfo.type === 'FAILED') {
          eventType = 'payment.failed';
        } else {
          eventType = 'payment.processing';
        }

        const processingTime = updatedTransaction.completedAt 
          ? new Date(updatedTransaction.completedAt).getTime() - new Date(updatedTransaction.createdAt).getTime()
          : undefined;

        await this.publishPaymentStatusEvent(
          updatedTransaction,
          updatedTransaction.intent,
          eventType,
          previousStatus,
          processingTime
        );
      }

      // If this is a final transaction status, finalize the payment intent
      if (codeInfo.isFinalStatus) {
        await this.finalizePaymentIntentFromTransaction(
          updatedTransaction,
          responseCode,
          requestId
        );
        
        this.logger.log(`Transaction ${transactionId} finalized payment intent: ${updatedTransaction.paymentIntentId}`);
      }

      // Credit merchant wallet for successful transactions (handled by finalization now)
      // if (codeInfo.type === 'SUCCESS' && updatedTransaction.settlementEligible) {
      //   await this.creditMerchantWallet(updatedTransaction, requestId);
      // }

      return updatedTransaction;
    } catch (error) {
      this.logger.error(`[${requestId}] Failed to update transaction status:`, error.stack);
      throw error;
    }
  }

  /**
   * Get all transactions for a payment intent
   */
  async getTransactionsByIntent(
    intentId: string,
    merchantId: string,
    requestId: string
  ): Promise<PaymentTransaction[]> {
    try {
      return await this.transactionRepository.find({
        where: { 
          paymentIntentId: intentId,
          merchantId 
        },
        order: { attemptNumber: 'DESC' }
      });
    } catch (error) {
      this.logger.error(`[${requestId}] Failed to get transactions:`, error.stack);
      throw error;
    }
  }

  /**
   * Get specific transaction
   */
  async getTransaction(
    transactionId: string,
    merchantId: string,
    requestId: string
  ): Promise<PaymentTransaction> {
    try {
      const transaction = await this.transactionRepository.findOne({
        where: { 
          transactionId,
          merchantId 
        },
        relations: ['intent', 'tspConfiguration']
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      return transaction;
    } catch (error) {
      this.logger.error(`[${requestId}] Failed to get transaction:`, error.stack);
      throw error;
    }
  }

  /**
   * Check for expired transactions and auto-abandon them
   */
  async processExpiredTransactions(): Promise<void> {
    try {
      const expiredTransactions = await this.transactionRepository.find({
        where: {
          status: 'processing',
          expiresAt: new Date() // Less than current time
        }
      });

      for (const transaction of expiredTransactions) {
        await this.updateTransactionStatus(
          transaction.transactionId,
          '1090', // Payment session expired
          { reason: 'Auto-abandoned due to expiration' },
          'SYSTEM_AUTO_ABANDON'
        );
      }

      if (expiredTransactions.length > 0) {
        this.logger.log(`Auto-abandoned ${expiredTransactions.length} expired transactions`);
      }
    } catch (error) {
      this.logger.error('Failed to process expired transactions:', error.stack);
    }
  }

  // Private helper methods

  private generateTransactionId(intentId: string, attemptNumber: number): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substr(2, 6);
    return `txn_${intentId.split('_')[1]}_${attemptNumber}_${timestamp}_${randomStr}`;
  }

  private mapResponseTypeToTransactionStatus(responseType: string): any {
    switch (responseType) {
      case 'SUCCESS': return 'success';
      case 'FAILED': return 'failed';
      case 'PENDING': return 'processing';
      case 'WAITING_BANK': return 'waiting_bank';
      case 'WAITING_CUSTOMER': return 'waiting_customer';
      case 'ABANDONED': return 'abandoned';
      case 'TIMEOUT': return 'timeout';
      case 'CANCELLED': return 'cancelled';
      case 'REFUNDED': return 'refunded';
      default: return 'failed';
    }
  }

  private async updatePaymentIntentFromTransaction(
    transaction: PaymentTransaction,
    requestId?: string
  ): Promise<void> {
    try {
      const intent = await this.intentRepository.findOne({
        where: { intentId: transaction.paymentIntentId }
      });

      if (!intent) {
        this.logger.warn(`Intent not found for transaction: ${transaction.transactionId}`);
        return;
      }

      // Determine if intent status should change
      const shouldUpdate = ResponseCodeManager.shouldUpdatePaymentIntent(transaction.responseCode);
      
      if (shouldUpdate.shouldUpdate) {
        intent.status = shouldUpdate.newIntentStatus as any;
        intent.attemptCount = transaction.attemptNumber;

        // Update latest successful payment URL
        if (transaction.status === 'success' && transaction.tspResponse?.paymentUrl) {
          intent.paymentUrl = transaction.tspResponse.paymentUrl;
        }

        await this.intentRepository.save(intent);

        this.logger.log(`[${requestId}] Updated intent ${intent.intentId} status to ${intent.status} due to ${shouldUpdate.reason}`);
      }
    } catch (error) {
      this.logger.error(`[${requestId}] Failed to update payment intent:`, error.stack);
    }
  }

  /**
   * Credit merchant wallet after successful payment
   */
  private async creditMerchantWallet(transaction: PaymentTransaction, requestId: string): Promise<void> {
    try {
      this.logger.log(`[${requestId}] Crediting merchant wallet for transaction: ${transaction.transactionId}`);

      // Credit merchant wallet via Wallet Service (Wallet Service will handle fee calculation)
      const walletResponse = await this.walletService.ProcessPaymentWithFees({
        merchant_id: transaction.merchantId,
        gross_amount: transaction.amount,
        currency: transaction.currency,
        transaction_type: 'payment_settlement',
        description: `Settlement for payment ${transaction.transactionId}`,
        source_transaction_id: transaction.transactionId,
        source_order_id: transaction.transactionId,
        request_id: requestId,
        payment_method: transaction.paymentMethod || 'unknown',
        metadata: {},
      });

      if (walletResponse.success) {
        this.logger.log(`[${requestId}] Wallet credited successfully: ${transaction.amount} ${transaction.currency} (Net: ${walletResponse.net_amount_to_merchant}, Balance: ${walletResponse.merchant_balance_after})`);
        // Settlement info is tracked in Wallet Service, no need to update transaction entity
      } else {
        this.logger.error(`[${requestId}] Wallet credit failed: ${walletResponse.message}`);
        throw new Error(`Wallet credit failed: ${walletResponse.message}`);
      }

    } catch (error) {
      this.logger.error(`[${requestId}] Failed to credit merchant wallet:`, error.stack);
      throw error;
    }
  }

  /**
   * Finalize payment intent status based on final transaction result
   */
  private async finalizePaymentIntentFromTransaction(
    transaction: PaymentTransaction,
    responseCode: string,
    requestId: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const intent = await this.intentRepository.findOne({
        where: { intentId: transaction.paymentIntentId }
      });

      if (!intent) {
        this.logger.error(`Payment intent ${transaction.paymentIntentId} not found for transaction finalization`);
        return;
      }

      const intentTransition = ResponseCodeManager.shouldUpdatePaymentIntent(responseCode);
      
      if (intentTransition.shouldUpdate) {
        await this.intentRepository.update(intent.id, {
          status: intentTransition.newIntentStatus as any,
          updatedAt: new Date(),
        });

        const settlementInfo = ResponseCodeManager.getSettlementEligibility(responseCode, intent.amount);
        if (settlementInfo.isEligible && transaction.settlementEligible) {
          if (settlementInfo.settlementType === 'credit') {
            await this.creditMerchantWallet(transaction, requestId);
          }
        }

        this.logger.log(
          `Payment intent ${intent.id} finalized by transaction ${transaction.id}: ` +
          `${intentTransition.newIntentStatus} (${intentTransition.reason}) | ` +
          `Settlement: ${settlementInfo.isEligible ? `${settlementInfo.settlementType} ${settlementInfo.settlementAmount}` : 'none'}`
        );

        const processingTimeMs = Date.now() - startTime;
        
        const eventType = intentTransition.newIntentStatus === 'succeeded' || intentTransition.newIntentStatus === 'completed' 
          ? 'payment.succeeded' 
          : intentTransition.newIntentStatus === 'failed' 
          ? 'payment.failed' 
          : 'payment.processing';

        this.publishPaymentStatusEvent(
          transaction, 
          intent, 
          eventType,
          transaction.status,
          processingTimeMs
        )
          .then(() => this.logger.log(`Payment status event published: ${transaction.transactionId}`))
          .catch(error => this.logger.error(`Failed to publish payment status event: ${error.message}`));

        await this.sendPaymentCompletionNotifications(transaction, intent, intentTransition.newIntentStatus, requestId);
      }

    } catch (error) {
      this.logger.error(`Failed to finalize payment intent from transaction ${transaction.id}:`, error);
    }
  }

  /**
   * Send webhook delivery and notifications after payment completion
   */
  private async sendPaymentCompletionNotifications(
    transaction: PaymentTransaction,
    intent: PaymentIntent,
    finalStatus: string,
    requestId: string
  ): Promise<void> {
    try {
      // Prepare payment notification data
      const paymentData: PaymentNotificationData = {
        payment_id: intent.intentId,
        transaction_id: transaction.transactionId,
        merchant_id: intent.merchantId.toString(),
        amount: intent.amount,
        currency: intent.currency,
        status: finalStatus,
        payment_method: transaction.paymentMethod || 'unknown',
        customer_email: intent.customerEmail,
        customer_phone: intent.customerPhone,
        order_id: intent.description || null, // Using description as order reference
        failure_reason: transaction.errorMessage,
        processed_at: new Date().toISOString(),
      };

      // 1. Create webhook delivery for merchant server
      if (finalStatus === 'completed' || finalStatus === 'succeeded' || finalStatus === 'failed') {
        const eventType = finalStatus === 'failed' ? 'payment.failed' : 'payment.success';
        
        // Note: We would need to get merchant webhook URL from merchant service
        // For now, using a placeholder - this would be fetched from merchant configuration
        const webhookData: WebhookDeliveryData = {
          event_type: eventType,
          payment_data: paymentData,
          merchant_webhook_url: `https://merchant-${intent.merchantId}.example.com/webhooks/valorapays`,
          retry_count: 0,
        };

        const webhookResult = await this.communicationService.createWebhookDelivery(webhookData);
        if (webhookResult?.success) {
          this.logger.log(`✅ Webhook delivery created for payment ${intent.intentId}: ${webhookResult.delivery_id}`);
        }
      }

      // 2. Send customer notifications (if customer contact info available)
      if (paymentData.customer_email) {
        const notificationType = finalStatus === 'failed' ? 'payment_failure' : 'payment_success';
        await this.communicationService.sendPaymentNotification(
          'email',
          notificationType,
          paymentData
        );
      }

      if (paymentData.customer_phone) {
        const notificationType = finalStatus === 'failed' ? 'payment_failure' : 'payment_success';
        await this.communicationService.sendPaymentNotification(
          'sms',
          notificationType,
          paymentData
        );
      }

      // 3. Broadcast real-time event to merchant dashboard
      const eventType = finalStatus === 'failed' ? 'payment_failed' : 
                       finalStatus === 'completed' || finalStatus === 'succeeded' ? 'payment_completed' : 'payment_updated';
      
      await this.communicationService.broadcastPaymentEvent(
        eventType,
        intent.merchantId.toString(),
        paymentData
      );

      // 4. Create alerts for failed payments
      if (finalStatus === 'failed') {
        await this.communicationService.createPaymentAlert({
          type: 'payment_failure',
          severity: 'medium',
          merchant_id: intent.merchantId.toString(),
          transaction_id: transaction.transactionId,
          tsp_name: transaction.tspProvider,
          error_details: {
            failure_reason: transaction.errorMessage,
            response_code: transaction.responseCode,
            amount: intent.amount,
            currency: intent.currency,
            payment_method: transaction.paymentMethod,
          },
        });
      }

      this.logger.log(`✅ Payment completion notifications sent for transaction ${transaction.transactionId}`);
      
    } catch (error) {
      this.logger.error(`Failed to send payment completion notifications for transaction ${transaction.transactionId}:`, error);
      // Don't throw - notification failures shouldn't affect payment completion
    }
  }

  async getAllTransactions(filters: {
    paymentMethod?: string;
    minAmount?: number;
    maxAmount?: number;
    customerId?: string;
    customerEmail?: string;
    customerPhone?: string;
    environment?: string;
    search?: string;
    page?: number;
    limit?: number;
    minimumAmount?: number;
    maximumAmount?: number;
    riskLevel?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    transactionId?: string;
    merchantId?: number | string;
    customerIdentifier?: string;
    currency?: string;
    type?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    includeRefunds?: boolean;
  }): Promise<{ transactions: PaymentTransaction[]; total: number }> {
    try {
      const query = this.transactionRepository
        .createQueryBuilder('txn')
        .leftJoinAndSelect('txn.intent', 'intent');

      this.applyFilters(query, filters);
      this.applySorting(query, filters);

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const skip = (page - 1) * limit;

      const [transactions, total] = await query
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return { transactions, total };
    } catch (error) {
      this.logger.error('Failed to search transactions:', error);
      throw error;
    }
  }

  private applyFilters(
    query: SelectQueryBuilder<PaymentTransaction>,
    filters: {
      merchantId?: number | string;
      status?: string;
      paymentMethod?: string;
      startDate?: string;
      endDate?: string;
      minAmount?: number;
      maxAmount?: number;
      customerId?: string;
      customerEmail?: string;
      customerPhone?: string;
      customerIdentifier?: string;
      transactionId?: string;
      environment?: string;
      currency?: string;
      riskLevel?: string;
      search?: string;
    }
  ): void {
    if (filters.merchantId) {
      query.where('txn.merchantId = :merchantId', { merchantId: filters.merchantId });
    }
    const filterConditions = [
      { condition: filters.status, sql: 'txn.status = :status', params: { status: filters.status } },
      { condition: filters.paymentMethod, sql: 'txn.paymentMethod = :paymentMethod', params: { paymentMethod: filters.paymentMethod } },
      { condition: filters.customerId, sql: 'intent.customerId = :customerId', params: { customerId: filters.customerId } },
      { condition: filters.environment, sql: 'intent.environment = :environment', params: { environment: filters.environment } },
      { condition: filters.currency, sql: 'intent.currency = :currency', params: { currency: filters.currency } },
      { condition: filters.minAmount, sql: 'txn.amount >= :minAmount', params: { minAmount: filters.minAmount } },
      { condition: filters.maxAmount, sql: 'txn.amount <= :maxAmount', params: { maxAmount: filters.maxAmount } },
      { condition: filters.riskLevel, sql: "txn.fraudAssessment->>'riskLevel' = :riskLevel", params: { riskLevel: filters.riskLevel } },
    ];

    filterConditions.forEach(({ condition, sql, params }) => {
      if (condition) {
        query.andWhere(sql, params);
      }
    });

    if (filters.transactionId) {
      query.andWhere('txn.transactionId LIKE :transactionId', {
        transactionId: `%${filters.transactionId}%`,
      });
    }

    if (filters.customerEmail) {
      query.andWhere(
        '(intent.customerEmail LIKE :customerEmail OR txn.customerEmail LIKE :customerEmail)',
        { customerEmail: `%${filters.customerEmail}%` },
      );
    }

    if (filters.customerPhone) {
      query.andWhere(
        '(intent.customerPhone LIKE :customerPhone OR txn.customerPhone LIKE :customerPhone)',
        { customerPhone: `%${filters.customerPhone}%` },
      );
    }
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      startDate.setHours(0, 0, 0, 0);
      query.andWhere('txn.createdAt >= :startDate', {
        startDate: startDate.toISOString(),
      });
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      query.andWhere('txn.createdAt <= :endDate', {
        endDate: endDate.toISOString(),
      });
    }

    if (filters.customerIdentifier) {
      query.andWhere(
        '(intent.customerEmail LIKE :customerIdentifier OR intent.customerPhone LIKE :customerIdentifier)',
        { customerIdentifier: `%${filters.customerIdentifier}%` },
      );
    }

    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      query.andWhere(
        '(txn.transactionId LIKE :search OR ' +
          'intent.description LIKE :search OR ' +
          'intent.customerEmail LIKE :search OR ' +
          'intent.customerName LIKE :search OR ' +
          'intent.customerPhone LIKE :search OR ' +
          'txn.customerEmail LIKE :search OR ' +
          'txn.customerName LIKE :search OR ' +
          // 'txn.orderId LIKE :search OR ' +
          'txn.customerPhone LIKE :search)', 
        { search: searchTerm },
      );
    }
  }

  private applySorting(
    query: SelectQueryBuilder<PaymentTransaction>,
    filters: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  ): void {
    const sortBy = filters.sortBy || SortColumns.CREATED_AT;
    const sortByLower = sortBy.toLowerCase().trim();
    const sortOrder =
      filters.sortOrder?.toLowerCase() === SortDirection.ASC.toLowerCase()
        ? SortDirection.ASC
        : SortDirection.DESC;

    const sortField = this.getSortField(sortByLower);
    const needsSecondarySort = this.requiresSecondarySort(sortByLower);

    query.orderBy(sortField, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    if (needsSecondarySort) {
      query.addOrderBy('txn.createdAt', SortDirection.DESC.toUpperCase() as 'ASC' | 'DESC');
    }
  }

  private getSortField(sortBy: string): string {
    const normalizedSort = sortBy.toLowerCase().trim();

    if (
      normalizedSort === SortColumns.AMOUNT ||
      normalizedSort === 'amount'
    ) {
      return 'txn.amount';
    }

    if (
      normalizedSort === SortColumns.STATUS ||
      normalizedSort === 'status'
    ) {
      return 'txn.status';
    }

    return 'txn.createdAt';
  }

  private requiresSecondarySort(sortBy: string): boolean {
    const normalizedSort = sortBy.toLowerCase().trim();
    return (
      normalizedSort === SortColumns.AMOUNT ||
      normalizedSort === 'amount' ||
      normalizedSort === SortColumns.STATUS ||
      normalizedSort === 'status'
    );
  }

  async getAverageTransactionValue(merchantId?: string): Promise<number> {
    const queryBuilder  = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('AVG(transaction.amount)', 'average');
      if (merchantId) {
        queryBuilder.where('transaction.merchantId = :merchantId', { merchantId });
      }
      const result = await queryBuilder.getRawOne();

    return result?.average ? parseFloat(result.average) : 0;
  }

  async getTotalTransactions(merchantId?: string): Promise<number> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .select('COUNT(*)', 'total');
    if (merchantId) {
      queryBuilder.where('transaction.merchantId = :merchantId', { merchantId });
    }
    const result = await queryBuilder.getRawOne();
    return result?.total ? parseInt(result.total) : 0;
  }
  
  async getTransactionVolume(
    merchantId?: string,
    options?: { status?: string; startDate?: Date; endDate?: Date }
  ): Promise<number> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .select('COALESCE(SUM(transaction.amount), 0)', 'total');

    if (merchantId) {
      queryBuilder.andWhere('transaction.merchantId = :merchantId', { merchantId });
    }

    if (options?.status) {
      queryBuilder.andWhere('transaction.status = :status', { status: options.status });
    }

    if (options?.startDate) {
      queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options?.endDate) {
      queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate: options.endDate });
    }

    const result = await queryBuilder.getRawOne();
    return result?.total ? parseFloat(result.total) : 0;
  }

  async getPendingTransactions(merchantId?: string): Promise<number> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .select('COUNT(*)', 'total')
      .where('transaction.status = :status', { status: 'processing' });

    if (merchantId) {
      queryBuilder.andWhere('transaction.merchantId = :merchantId', { merchantId: parseInt(merchantId) });
    }

    const result = await queryBuilder.getRawOne();
    return result?.total ? parseInt(result.total) : 0;
  }

  async getFailedTransactions(merchantId?: string): Promise<number> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .select('COUNT(*)', 'total');
      if (merchantId) {
        queryBuilder.where('transaction.merchantId = :merchantId', { merchantId: parseInt(merchantId) });
      }
      queryBuilder.andWhere('transaction.status = :status', { status: 'failed' });
    const result = await queryBuilder.getRawOne();
    return result?.total ? parseInt(result.total) : 0;
  }


  async getTransactionSuccessRate(
    merchantId?: string,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<number> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .select('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN transaction.status = 'success' THEN 1 ELSE 0 END)`,
        'successful'
      );

    if (merchantId) {
      queryBuilder.where('transaction.merchantId = :merchantId', { merchantId: parseInt(merchantId) });
    }

    if (options?.startDate) {
      queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options?.endDate) {
      queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate: options.endDate });
    }

    const result = await queryBuilder.getRawOne();

    if (!result || !result.total || parseInt(result.total) === 0) {
      return 0;
    }

    const successRate = (parseInt(result.successful) / parseInt(result.total)) * 100;
    return Math.round(successRate * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get single transaction by ID
   */
  async getTransactionById(transactionId: string, merchantId: string): Promise<PaymentTransaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId, merchantId },
      relations: ['intent'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }


  /**
   * Get payment method analytics
   */
  async getPaymentMethodAnalytics(
    merchantId?: string,
    options?: { 
      startDate?: Date; 
      endDate?: Date; 
      status?: string;
      environment?: string;
    }
  ): Promise<{
    paymentMethod: string;
    transactionCount: number;
    transactionVolume: number;
    successRate: number;
    averageProcessingTime: number;
    marketShare: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
    popularityRank: number;
  }[]> {
    try {
      const queryBuilder = this.transactionRepository
        .createQueryBuilder('transaction')
        .select([
          'transaction.paymentMethod as paymentMethod',
          'COUNT(transaction.id) as transactionCount',
          'SUM(transaction.amount) as transactionVolume',
          'AVG(EXTRACT(EPOCH FROM (transaction.updatedAt - transaction.createdAt))) as averageProcessingTime',
          'SUM(CASE WHEN transaction.status = \'success\' THEN 1 ELSE 0 END) as successfulCount',
          'COUNT(transaction.id) as totalCount'
        ])
        .groupBy('transaction.paymentMethod')
        .orderBy('transactionVolume', 'DESC');

      // Apply merchant filter
      if (merchantId) {
        queryBuilder.where('transaction.merchantId = :merchantId', { merchantId: parseInt(merchantId) });
      }

      // Apply date range filter
      if (options?.startDate) {
        queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate: options.startDate });
      }

      if (options?.endDate) {
        queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate: options.endDate });
      }

      // Apply status filter
      if (options?.status) {
        queryBuilder.andWhere('transaction.status = :status', { status: options.status });
      }

      // Apply environment filter
      if (options?.environment) {
        queryBuilder.andWhere('transaction.environment = :environment', { environment: options.environment });
      }

      const results = await queryBuilder.getRawMany();

      // Calculate total volume for market share
      const totalVolume = results.reduce((sum, row) => sum + parseFloat(row.transactionVolume || '0'), 0);

      // Calculate success rates and format results
      const analytics = results.map((row, index) => {
        const transactionCount = parseInt(row.transactionCount || '0', 10);
        const successfulCount = parseInt(row.successfulCount || '0', 10);
        const successRate = transactionCount > 0 ? (successfulCount / transactionCount) * 100 : 0;
        const transactionVolume = parseFloat(row.transactionVolume || '0');
        const marketShare = totalVolume > 0 ? (transactionVolume / totalVolume) * 100 : 0;

        return {
          paymentMethod: row.paymentMethod || 'unknown',
          transactionCount,
          transactionVolume,
          successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
          averageProcessingTime: parseFloat(row.averageProcessingTime || '0'),
          marketShare: Math.round(marketShare * 100) / 100, // Round to 2 decimal places
          trend: this.calculatePaymentMethodTrend(row.paymentMethod, options), // You can implement this method
          popularityRank: index + 1,
        };
      });

      return analytics;
    } catch (error) {
      this.logger.error('Failed to get payment method analytics:', error);
      throw error;
    }
  }
    /**
   * Get comprehensive transaction volume metrics
   */
    async getTransactionSummary(filters: TransactionAnalyticsFilters): Promise<TransactionSummary> {
      this.logger.log(`Getting transaction summary with filters: ${JSON.stringify(filters)}`);
  
      try {
        // Build main metrics query

        const transactionsQuery = this.transactionRepository.createQueryBuilder('transaction')
          .select([
            'COUNT(transaction_id) as total_transactions',
            'SUM(amount) as total_volume',
            'AVG(amount) as average_ticket_size',
            'SUM(CASE WHEN status = \'SUCCESS\' THEN 1 ELSE 0 END) as successful_transactions',
            'SUM(CASE WHEN status = \'FAILED\' THEN 1 ELSE 0 END) as failed_transactions',
            'SUM(CASE WHEN status = \'PENDING\' THEN 1 ELSE 0 END) as pending_transactions',
          ]);
          if(filters.startDate) {
            transactionsQuery.andWhere('transaction.createdAt >= :startDate', { startDate: filters.startDate });
          }
          if(filters.endDate) {
            transactionsQuery.andWhere('transaction.createdAt <= :endDate', { endDate: filters.endDate });
          }
          if(filters.merchantId) {
            transactionsQuery.andWhere('transaction.merchantId = :merchantId', { merchantId: filters.merchantId });
          }
          if(filters.status) {
            transactionsQuery.andWhere('transaction.status = :status', { status: filters.status });
          }
          if(filters.paymentMethod) {
            transactionsQuery.andWhere('transaction.paymentMethod = :paymentMethod', { paymentMethod: filters.paymentMethod });
          }

        const totalTransactions = await this.getTotalTransactions(filters?.merchantId);
        const transactionsSuccessRate = await this.getTransactionSuccessRate(filters?.merchantId);
        const failedTransactions = await this.getFailedTransactions(filters?.merchantId);
        const pendingTransactions = await this.getPendingTransactions(filters?.merchantId);
        const averageTicketSize = await this.getAverageTransactionValue(filters?.merchantId);
        const totalVolume = await this.getTransactionVolume(filters?.merchantId);

        const metrics: TransactionSummary = {
          totalTransactions,
          totalVolume,
          averageTicketSize,
          successfulTransactions: transactionsSuccessRate,  // number of successful transactions
          failedTransactions,  // number of failed transactions
          pendingTransactions,  // number of pending transactions
          successRate: transactionsSuccessRate,  // success rate
          failureRate: failedTransactions / totalTransactions,  // failure rate
          period: `${filters.startDate} to ${filters.endDate}`,  // period
          currency: filters.currency || 'INR',  // currency
        }
  
        // Add time series if requested
        if (filters.includeTimeSeries) {
          metrics.timeSeries = await this.getTimeSeriesData(filters);
        }
  
        // Add comparison if requested
        if (filters.includeComparison) {
          metrics.comparison = await this.getComparisonMetrics(filters, metrics);
        }
  
        return metrics;
      } catch (error) {
        this.logger.error(`Failed to get transaction volume metrics: ${error.message}`, error.stack);
        throw error;
      }
    }

      /**
   * Get comparison metrics for previous period
   */
  private async getComparisonMetrics(filters: TransactionAnalyticsFilters, currentMetrics: TransactionSummary): Promise<ComparisonMetrics> {
    // Calculate previous period dates
    const startDate = new Date(filters.startDate);
    const endDate = new Date(filters.endDate);
    const periodDuration = endDate.getTime() - startDate.getTime();
    
    const previousStartDate = new Date(startDate.getTime() - periodDuration);
    const previousEndDate = new Date(endDate.getTime() - periodDuration);

    const previousFilters: TransactionAnalyticsFilters = {
      ...filters,
      startDate: previousStartDate.toISOString(),
      endDate: previousEndDate.toISOString(),
      includeTimeSeries: false,
      includeComparison: false,
    };

    const previousMetrics = await this.getTransactionSummary(previousFilters);

    const volumeChange = currentMetrics.totalVolume - previousMetrics.totalVolume;
    const changePercentage = previousMetrics.totalVolume > 0 ? 
      (volumeChange / previousMetrics.totalVolume) * 100 : 0;

    let trend: 'UP' | 'DOWN' | 'STABLE';
    if (Math.abs(changePercentage) < 5) {
      trend = 'STABLE';
    } else if (changePercentage > 0) {
      trend = 'UP';
    } else {
      trend = 'DOWN';
    }

    return {
      previousPeriod: previousMetrics,
      changePercentage,
      trend,
    };
  }
/**
   * Get time series data for transaction metrics
   */
private async getTimeSeriesData(filters: TransactionAnalyticsFilters): Promise<TimeSeriesPoint[]> {
  const granularity = filters.granularity || 'day';
  let timeFunction: string;

  switch (granularity) {
    case 'hour':
      timeFunction = 'toStartOfHour(created_at)';
      break;
    case 'day':
      timeFunction = 'toStartOfDay(created_at)';
      break;
    case 'week':
      timeFunction = 'toMonday(created_at)';
      break;
    case 'month':
      timeFunction = 'toStartOfMonth(created_at)';
      break;
    default:
      timeFunction = 'toStartOfDay(created_at)';
  }

  const query = this.transactionRepository.createQueryBuilder('transaction')
    .select([
      `${timeFunction} as time_bucket`,
      'COUNT(transaction_id) as transaction_count',
      'SUM(amount) as transaction_volume',
      'AVG(amount) as average_ticket_size',
    ])
    .where('transaction.createdAt >= :startDate', { startDate: filters.startDate })
    .where('transaction.createdAt <= :endDate', { endDate: filters.endDate })
    .groupBy('time_bucket')
    .orderBy('time_bucket', 'ASC');
    
    if(filters.merchantId) {
      query.andWhere('transaction.merchantId = :merchantId', { merchantId: filters.merchantId });
    }
    if(filters.status) {
      query.andWhere('transaction.status = :status', { status: filters.status });
    }
    if(filters.paymentMethod) {
      query.andWhere('transaction.paymentMethod = :paymentMethod', { paymentMethod: filters.paymentMethod });
    }
    if(filters.startDate) {
      query.andWhere('transaction.createdAt >= :startDate', { startDate: filters.startDate });
    }
    if(filters.endDate) {
      query.andWhere('transaction.createdAt <= :endDate', { endDate: filters.endDate });
    }
    if(filters.granularity) {
      query.groupBy(filters.granularity);
    }
    if(filters.currency) {
      query.andWhere('transaction.currency = :currency', { currency: filters.currency });
    }
  
  
  const results = await query.getRawMany();

  return results.map((row: any) => ({
    timestamp: new Date(row.time_bucket).toISOString(),
    value: parseFloat(row.transaction_volume || '0'),
    count: parseInt(row.transaction_count || '0', 10),
    additionalMetrics: {
      averageTicketSize: parseFloat(row.average_ticket_size || '0'),
    },
  }));
}

  /**
   * Calculate trend for payment method (placeholder implementation)
   */
  private calculatePaymentMethodTrend(paymentMethod: string, options?: any): 'UP' | 'DOWN' | 'STABLE' {
    // This is a placeholder implementation
    // In a real scenario, you would compare current period with previous period
    return 'STABLE';
  }

}

import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import axios from 'axios';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { TSPConfiguration } from '@/entities/tsp-configuration.entity';
import { LoggerService } from '@/common/services/logger.service';
import { TSPFactoryService } from '@/tsp/tsp-factory.service';
import { ResponseCodeManager } from '@/common/response-codes';
import { AuthenticatedGrpcService } from '@/grpc/authenticated-grpc.service';
import { MerchantWebhookService } from './merchant/merchant-webhook.service';
import { TSPProvider } from '@/enums/tsp-provider.enum';
import { WalletServiceGrpc, MerchantServiceGrpc } from '@/types';
import { KingdomBankWebhookNotificationDto } from '@/dto/webhooks/kingdom-bank-webhook.dto';
import { KingdomBankAdapter } from '@/tsp/adapters/kingdom-bank.adapter';
import { Payout, PayoutStatus } from '@/entities/payout.entity';
import { PaymentTransactionService } from '@/modules/payment-transaction/payment-transaction.service';
import { PaymentStatusGateway } from '@/modules/payment-status/payment-status.gateway';
import { SulifuPayWebhookHandler, KingdomBankWebhookHandler, PayazaWebhookHandler } from './handlers';

@Injectable()
export class WebhookService implements OnModuleInit {
  private walletService: WalletServiceGrpc;
  private merchantService: MerchantServiceGrpc;

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    
    @InjectRepository(PaymentIntent)
    private readonly paymentIntentRepo: Repository<PaymentIntent>,
    
    @InjectRepository(TSPConfiguration)
    private readonly tspConfigRepo: Repository<TSPConfiguration>,
    
    @InjectRepository(Payout)
    private readonly payoutRepo: Repository<Payout>,
    
    private readonly logger: LoggerService,
    private readonly tspFactory: TSPFactoryService,
    
    @Inject('WALLET_SERVICE') 
    private readonly walletGrpcClient: ClientGrpc,
    
    @Inject('MERCHANT_SERVICE')
    private readonly merchantGrpcClient: ClientGrpc,
    
    private readonly authenticatedGrpc: AuthenticatedGrpcService,
    private readonly merchantWebhookService: MerchantWebhookService,
    private readonly paymentTransactionService: PaymentTransactionService,
    private readonly paymentStatusGateway: PaymentStatusGateway,
    private readonly sulifuPayWebhookHandler: SulifuPayWebhookHandler,
    private readonly kingdomBankWebhookHandler: KingdomBankWebhookHandler,
    private readonly payazaWebhookHandler: PayazaWebhookHandler,
  ) {}

  onModuleInit() {
    this.walletService = this.authenticatedGrpc.wrapGrpcClient<WalletServiceGrpc>(
      this.walletGrpcClient,
      'WalletService',
      'wallet-service'
    );
    
    this.merchantService = this.authenticatedGrpc.wrapGrpcClient<MerchantServiceGrpc>(
      this.merchantGrpcClient,
      'MerchantService',
      'merchant-service'
    );
  }

  /**
   * Process Razorpay webhook
   */
  async processRazorpayWebhook(payload: any, signature: string): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      this.logger.log(`Processing Razorpay webhook: ${payload.event} for ${payload.payload?.payment?.entity?.id}`);

      const tspConfig = await this.tspConfigRepo.findOne({
        where: { providerName: TSPProvider.RAZORPAY, isActive: true },
      });

      if (!tspConfig) {
        throw new Error('Razorpay configuration not found');
      }

      const tspAdapter = await this.tspFactory.getTSPAdapter(TSPProvider.RAZORPAY, tspConfig.environment);
      
      if (!tspAdapter || !tspAdapter.verifyWebhookSignature) {
        throw new Error('Razorpay adapter not available');
      }

      const webhookSecret = tspConfig.credentials['webhook_secret'] as string;
      const isValidSignature = tspAdapter.verifyWebhookSignature(
        JSON.stringify(payload), 
        signature, 
        webhookSecret
      );

      if (!isValidSignature) {
        this.logger.error('Invalid Razorpay webhook signature');
        throw new Error('Invalid webhook signature');
      }

      const paymentData = payload.payload?.payment?.entity;
      const orderId = paymentData?.order_id;
      
      if (!paymentData || !orderId) {
        this.logger.error('Invalid Razorpay webhook payload structure');
        throw new Error('Invalid webhook payload');
      }

      const transaction = await this.transactionRepo.findOne({
        where: { externalTransactionId: orderId },
        relations: ['paymentIntent'],
      });

      if (!transaction) {
        this.logger.warn(`Transaction not found for Razorpay order: ${orderId}`);
        return {
          transactionId: orderId,
          status: 'not_found',
          updated: false,
        };
      }
      // Update transaction status based on webhook event
      const newStatus = this.mapRazorpayWebhookToStatus(payload.event, paymentData);
      const responseCode = this.mapRazorpayStatusToResponseCode(newStatus, paymentData);

      await this.transactionRepo.update(transaction.id, {
        status: newStatus as any,
        responseCode,
        tspResponse: paymentData,
      });

      const newIntentStatus = this.mapTransactionStatusToIntentStatus(newStatus);
      await this.paymentIntentRepo.update(transaction.intent.id, {
        status: newIntentStatus as any,
      });

      this.logger.log(`Razorpay webhook processed: ${orderId} -> ${newStatus}`);

      if (newStatus === 'completed' || newStatus === 'captured') {
        await this.creditMerchantWallet(transaction, orderId);
        await this.merchantWebhookService.deliverMerchantWebhook(transaction, 'payment.success', orderId);
      } else if (newStatus === 'failed' || newStatus === 'cancelled') {
        await this.merchantWebhookService.deliverMerchantWebhook(transaction, 'payment.failed', orderId);
      }

      return {
        transactionId: orderId,
        status: newStatus,
        updated: true,
      };

    } catch (error) {
      this.logger.error('Razorpay webhook processing failed:', error);
      throw error;
    }
  }

  /**
   * Process Paytara webhook
   */
  async processPaytaraWebhook(payload: any, hash: string): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      this.logger.log(`Processing Paytara webhook for transaction: ${payload.transaction_id}`);

      const tspConfig = await this.tspConfigRepo.findOne({
        where: { providerName: TSPProvider.PAYTARA, isActive: true },
      });

      if (!tspConfig) {
        throw new Error('Paytara configuration not found');
      }

      const tspAdapter = await this.tspFactory.getTSPAdapter(TSPProvider.PAYTARA, tspConfig.environment);
      
      if (!tspAdapter || !tspAdapter.verifyWebhookSignature) {
        throw new Error('Paytara adapter not available');
      }

      const isValidHash = tspAdapter.verifyWebhookSignature(payload, hash);

      if (!isValidHash) {
        this.logger.error('Invalid Paytara webhook hash');
        throw new Error('Invalid webhook hash');
      }

      const transaction = await this.transactionRepo.findOne({
        where: { externalTransactionId: payload.transaction_id },
        relations: ['paymentIntent'],
      });

      if (!transaction) {
        this.logger.warn(`Transaction not found for Paytara ID: ${payload.transaction_id}`);
        return {
          transactionId: payload.transaction_id,
          status: 'not_found',
          updated: false,
        };
      }

      const newStatus = this.mapPaytaraWebhookToStatus(payload.status, payload.payment_status);
      const responseCode = this.mapPaytaraStatusToResponseCode(newStatus, payload);

      await this.transactionRepo.update(transaction.id, {
        status: newStatus as any,
        responseCode,
        tspResponse: payload,
      });

      const newIntentStatus = this.mapTransactionStatusToIntentStatus(newStatus);
      await this.paymentIntentRepo.update(transaction.intent.id, {
        status: newIntentStatus as any,
      });

      this.logger.log(`Paytara webhook processed: ${payload.transaction_id} -> ${newStatus}`);

      if (newStatus === 'completed' || newStatus === 'success') {
        await this.creditMerchantWallet(transaction, payload.transaction_id)
        await this.merchantWebhookService.deliverMerchantWebhook(transaction, 'payment.success', payload.transaction_id);
      } else if (newStatus === 'failed' || newStatus === 'cancelled') {
        await this.merchantWebhookService.deliverMerchantWebhook(transaction, 'payment.failed', payload.transaction_id);
      }

      return {
        transactionId: payload.transaction_id,
        status: newStatus,
        updated: true,
      };

    } catch (error) {
      this.logger.error('Paytara webhook processing failed:', error);
      throw error;
    }
  }

  /**
   * Process Stripe webhook
   */
  async processStripeWebhook(payload: any, signature: string): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    try {
      this.logger.log(`Processing Stripe webhook: ${payload.type} for ${payload.data?.object?.id}`);

      // Get TSP configuration
      const tspConfig = await this.tspConfigRepo.findOne({
        where: { providerName: TSPProvider.STRIPE, isActive: true },
      });

      if (!tspConfig) {
        throw new Error('Stripe configuration not found');
      }

      // Get adapter for signature verification
      const tspAdapter = await this.tspFactory.getTSPAdapter(TSPProvider.STRIPE, tspConfig.environment);
      
      if (!tspAdapter || !tspAdapter.verifyWebhookSignature) {
        throw new Error('Stripe adapter not available');
      }

      // Verify webhook signature
      const webhookSecret = tspConfig.credentials['webhook_secret'] as string;
      const isValidSignature = tspAdapter.verifyWebhookSignature(
        JSON.stringify(payload), 
        signature, 
        webhookSecret
      );

      if (!isValidSignature) {
        this.logger.error('Invalid Stripe webhook signature');
        throw new Error('Invalid webhook signature');
      }

      const paymentIntent = payload.data?.object;
      const paymentIntentId = paymentIntent?.id;
      
      if (!paymentIntentId) {
        this.logger.error('Invalid Stripe webhook payload structure');
        throw new Error('Invalid webhook payload');
      }

      // Find transaction by external transaction ID
      const transaction = await this.transactionRepo.findOne({
        where: { externalTransactionId: paymentIntentId },
        relations: ['paymentIntent'],
      });

      if (!transaction) {
        this.logger.warn(`Transaction not found for Stripe payment intent: ${paymentIntentId}`);
        return {
          transactionId: paymentIntentId,
          status: 'not_found',
          updated: false,
        };
      }

      // Update transaction status based on webhook event
      const newStatus = this.mapStripeWebhookToStatus(payload.type, paymentIntent);
      const responseCode = this.mapStripeStatusToResponseCode(newStatus, paymentIntent);

      await this.transactionRepo.update(transaction.id, {
        status: newStatus as any,
        responseCode,
        tspResponse: paymentIntent,
      });

      // Update payment intent status
      const newIntentStatus = this.mapTransactionStatusToIntentStatus(newStatus);
      await this.paymentIntentRepo.update(transaction.intent.id, {
        status: newIntentStatus as any,
      });

      this.logger.log(`Stripe webhook processed: ${paymentIntentId} -> ${newStatus}`);

      // Credit merchant wallet for successful payments
      if (newStatus === 'completed' || newStatus === 'succeeded') {
        await this.creditMerchantWallet(transaction, paymentIntentId);
        // Delivery webhook notification via Communication Service is now handled 
        // in PaymentTransactionService.finalizePaymentIntentFromTransaction()
        this.logger.log(`Payment ${newStatus}: webhook delivery handled by PaymentTransactionService`);
      } else if (newStatus === 'failed' || newStatus === 'cancelled') {
        // Delivery webhook notification via Communication Service is now handled 
        // in PaymentTransactionService.finalizePaymentIntentFromTransaction()
        this.logger.log(`Payment ${newStatus}: webhook delivery handled by PaymentTransactionService`);
      }

      return {
        transactionId: paymentIntentId,
        status: newStatus,
        updated: true,
      };

    } catch (error) {
      this.logger.error('Stripe webhook processing failed:', error);
      throw error;
    }
  }

  /**
   * Process Payaza webhook
   * Delegates to PayazaWebhookHandler
   */
  async processPayazaWebhook(payload: any, signature: string): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    return this.payazaWebhookHandler.processWebhook(payload, signature, this.walletService);
  }

  /**
   * Generic webhook processor for other TSPs
   */
  async processGenericWebhook(provider: string, payload: any, headers: Record<string, string>): Promise<any> {
    try {
      this.logger.log(`Processing ${provider} webhook`);

      // Log webhook for manual processing if needed
      this.logger.log(`${provider} webhook payload: ${JSON.stringify(payload, null, 2)}`);
      this.logger.log(`${provider} webhook headers: ${JSON.stringify(headers, null, 2)}`);

      return {
        provider,
        received: true,
        timestamp: new Date(),
        payload,
      };

    } catch (error) {
      this.logger.error(`Generic webhook processing failed for ${provider}:`, error);
      throw error;
    }
  }

  // Private helper methods for status mapping

  private mapRazorpayWebhookToStatus(event: string, paymentData: any): string {
    switch (event) {
      case 'payment.captured':
        return 'completed';
      case 'payment.failed':
        return 'failed';
      case 'payment.authorized':
        return 'authorized';
      default:
        return paymentData.status || 'pending';
    }
  }

  private mapPaytaraWebhookToStatus(status: string, paymentStatus: string): string {
    if (status === 'success' && paymentStatus === 'captured') {
      return 'completed';
    }
    if (status === 'failed' || paymentStatus === 'failed') {
      return 'failed';
    }
    if (paymentStatus === 'cancelled') {
      return 'cancelled';
    }
    return 'pending';
  }

  private mapStripeWebhookToStatus(eventType: string, paymentIntent: any): string {
    switch (eventType) {
      case 'payment_intent.succeeded':
        return 'completed';
      case 'payment_intent.payment_failed':
        return 'failed';
      case 'payment_intent.canceled':
        return 'cancelled';
      case 'payment_intent.requires_action':
        return 'requires_action';
      default:
        return paymentIntent.status || 'pending';
    }
  }

  private mapRazorpayStatusToResponseCode(status: string, paymentData: any): string {
    switch (status) {
      case 'completed':
        return '0'; // Success
      case 'failed':
        return paymentData.error_code || '1000'; // Generic failure
      case 'authorized':
        return '1088'; // Processing
      default:
        return '1088'; // Processing
    }
  }

  private mapPaytaraStatusToResponseCode(status: string, payload: any): string {
    switch (status) {
      case 'completed':
        return '0'; // Success
      case 'failed':
        return payload.error_code || '1000'; // Generic failure
      case 'cancelled':
        return '1043'; // Cancelled
      default:
        return '1088'; // Processing
    }
  }

  private mapStripeStatusToResponseCode(status: string, paymentIntent: any): string {
    switch (status) {
      case 'completed':
        return '0'; // Success
      case 'failed':
        return '1000'; // Generic failure
      case 'cancelled':
        return '1043'; // Cancelled
      case 'requires_action':
        return '3000'; // Requires action
      default:
        return '1088'; // Processing
    }
  }

  private mapTransactionStatusToIntentStatus(transactionStatus: string): string {
    switch (transactionStatus) {
      case 'completed':
      case 'success':
        return 'succeeded';
      case 'failed':
        return 'requires_payment_method';
      case 'cancelled':
        return 'canceled';
      case 'requires_action':
        return 'requires_action';
      default:
        return 'processing';
    }
  }

  /**
   * Credit merchant wallet after successful payment confirmation via webhook
   */
  private async creditMerchantWallet(transaction: PaymentTransaction, requestId: string): Promise<void> {
    try {
      this.logger.log(`[${requestId}] Processing wallet credit for successful payment: ${transaction.transactionId}`);

      // Check if transaction is eligible for settlement
      const codeInfo = ResponseCodeManager.getResponseCodeInfo(transaction.responseCode);
      if (!codeInfo?.affectsSettlement) {
        this.logger.log(`[${requestId}] Transaction not eligible for settlement: ${transaction.responseCode}`);
        return;
      }
        this.logger.log(`[${requestId}] Calling Wallet Service with merchantId: ${transaction.merchantId}`);
  
        // Credit merchant wallet via Wallet Service (auto-creates wallet if not found)
      const walletResponse = await this.walletService.ProcessPaymentWithFees({
        merchant_id: transaction.merchantId,
        gross_amount: transaction.amount,
        currency: transaction.currency,
        transaction_type: 'webhook_settlement',
        description: `Webhook settlement for payment ${transaction.transactionId}`,
        source_transaction_id: transaction.transactionId,
        source_order_id: transaction.transactionId,
        request_id: requestId,
        payment_method: transaction.paymentMethod || 'unknown',
        metadata: {},
      });

      if (walletResponse.success) {
        this.logger.log(`[${requestId}] Wallet credited via webhook: ${transaction.amount} ${transaction.currency} (Net: ${walletResponse.net_amount_to_merchant}, Fees: ${walletResponse.total_fees}, Balance: ${walletResponse.merchant_balance_after})`);
        
        // Update transaction with settlement info
        await this.transactionRepo.update(transaction.id, {
          settledAt: new Date(),
          settlementAmount: walletResponse.net_amount_to_merchant,
          walletTransactionId: walletResponse.merchant_wallet_transaction_id,
        } as any);
      } else {
        this.logger.error(`[${requestId}] Webhook wallet credit failed: ${walletResponse.error_message || walletResponse.message}`);
      }

    } catch (error) {
      this.logger.error(`[${requestId}] Failed to credit merchant wallet via webhook:`, error.stack);
    }
  }

  /**
   * Update customer transaction statistics
   */
  private async updateCustomerTransactionStats(
    transaction: PaymentTransaction,
    transactionStatus: 'success' | 'failed',
    payload: any
  ): Promise<void> {
    try {
      // Get customer ID from payment intent (use loaded relation or fetch)
      const paymentIntent = transaction.intent || await this.paymentIntentRepo.findOne({
        where: { intentId: transaction.paymentIntentId }
      });

      if (!paymentIntent || !paymentIntent.customerId) {
        this.logger.warn(`No customer found for transaction: ${transaction.transactionId}`);
        return;
      }

      this.logger.log(`Updating customer stats for: ${paymentIntent.customerId}, transaction: ${transaction.transactionId}, status: ${transactionStatus}`);

      // Call Merchant Service to update stats
      const updateRequest = {
        customer_id: paymentIntent.customerId,
        merchant_id: transaction.merchantId,
        currency: transaction.currency,
        amount: transaction.amount,
        transaction_status: transactionStatus,
        transaction_id: transaction.transactionId,
        payment_method: transaction.paymentMethod || 'unknown',
        transaction_date: new Date().toISOString()
      };

      // AuthenticatedGrpcService already converts Observable to Promise
      const response = await (this.merchantService.UpdateCustomerTransactionStats(updateRequest) as any);

      if (response?.success) {
        this.logger.log(`Successfully updated customer stats for: ${paymentIntent.customerId}`);
      } else {
        this.logger.warn(`Failed to update customer stats: ${response?.message || 'Unknown error'}`);
      }

    } catch (error) {
      this.logger.error(`Error updating customer transaction stats:`, error.stack);
    }
  }

  async processKingdomBankWebhook(
    payload: KingdomBankWebhookNotificationDto,
    signature: string,
    signatureKeyId: string
  ): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    return this.kingdomBankWebhookHandler.processWebhook(
      payload,
          signature,
      signatureKeyId,
      this.walletService,
      this.updateCustomerTransactionStats.bind(this)
          );
  }

  async processPayoutWebhook(
    tspProvider: string,
    payload: any,
    signature: string,
    signatureKeyId: string
  ): Promise<{
    payoutId: string;
    status: string;
    refunded: boolean;
  }> {
    try {
      this.logger.log(`Processing ${tspProvider} payout webhook`);

      let externalPayoutId: string;
      let status: string;

      if (tspProvider.toLowerCase() === 'kingdom-bank' || tspProvider.toLowerCase() === 'kingdom_bank') {
        const tspConfig = await this.tspConfigRepo.findOne({
          where: { providerName: TSPProvider.KINGDOM_BANK, isActive: true },
        });

        if (tspConfig) {
          const adapter = new KingdomBankAdapter(
            tspConfig,
            this.logger
          );

          const isValid = adapter.verifyWebhookSignature(
            JSON.stringify(payload),
            signature,
            tspConfig.credentials['signatureKey'] as string
          );

          if (!isValid) {
            throw new Error('Invalid Kingdom Bank webhook signature');
          }
        }

        externalPayoutId = payload.transactionId?.toString();
        status = payload.status;
      } else if (tspProvider.toLowerCase() === 'paytara') {
        externalPayoutId = payload.txnid || payload.transactionId;
        status = payload.status;
      } else {
        throw new Error(`Unsupported TSP provider: ${tspProvider}`);
      }

      const payout = await this.payoutRepo.findOne({
        where: { externalPayoutId },
      });

      if (!payout) {
        throw new Error(`Payout not found: ${externalPayoutId}`);
      }

      let refunded = false;
      const blockId = payout.metadata?.blockId || payout.walletTransactionId;

      if (status === 'PROCESSED' || status === 'SUCCESS' || status === 'completed') {
        this.logger.log(`Payout ${payout.payoutId} SUCCESS - Debiting blocked amount`);

        const debitResult = await this.walletService.DebitBlockedAmount({
          merchant_id: payout.merchantId,
          block_id: blockId,
          currency: payout.currency,
          description: `Payout completed: ${payout.payoutId}`,
          request_id: `payout_debit_${payout.payoutId}`,
        });

        if (debitResult.success) {
          await this.payoutRepo.update(
            { payoutId: payout.payoutId },
            {
              status: PayoutStatus.COMPLETED,
              completedAt: new Date(),
              bankReferenceNumber: payload.bankReferenceNumber || payload.utr,
            }
          );

          this.logger.log(`Payout ${payout.payoutId} completed. Wallet debited successfully.`);
        } else {
          this.logger.error(`Failed to debit blocked amount for payout ${payout.payoutId}`);
          throw new Error('Wallet debit failed');
        }

      } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'failed') {
        this.logger.log(`Payout ${payout.payoutId} FAILED - Releasing blocked amount (REFUND)`);

        const releaseResult = await this.walletService.ReleaseBlockedAmount({
          merchant_id: payout.merchantId,
          block_id: blockId,
          currency: payout.currency,
          release_reason: `Payout failed: ${payload.failureReason || 'Unknown'}`,
          request_id: `payout_release_${payout.payoutId}`,
        });

        if (releaseResult.success) {
          await this.payoutRepo.update(
            { payoutId: payout.payoutId },
            {
              status: PayoutStatus.FAILED,
              failureReason: payload.failureReason || payload.message || 'Payout failed',
            }
          );

          refunded = true;
          this.logger.log(`Payout ${payout.payoutId} failed. Amount refunded to merchant wallet.`);
        } else {
          this.logger.error(`CRITICAL: Failed to release blocked amount for payout ${payout.payoutId}`);
          throw new Error('Wallet release failed - manual intervention required');
        }
      }

      if (payout.webhookUrl) {
        try {
          await axios.post(payout.webhookUrl, {
            event: 'payout.status_update',
            payoutId: payout.payoutId,
            externalPayoutId: payout.externalPayoutId,
            status: payout.status,
            amount: payout.amount,
            currency: payout.currency,
            refunded,
            timestamp: new Date().toISOString(),
          }, {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Valorapays-Webhook/1.0',
            },
          });
          this.logger.log(`Merchant webhook delivered for payout ${payout.payoutId}`);
        } catch (error) {
          this.logger.error(`Failed to deliver merchant webhook for payout ${payout.payoutId}: ${error.message}`);
        }
      }

      return {
        payoutId: payout.payoutId,
        status: payout.status,
        refunded,
      };

    } catch (error) {
      this.logger.error(`Payout webhook processing failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async processSulifuPayWebhook(payload: any): Promise<{
    transactionId: string;
    status: string;
    updated: boolean;
  }> {
    return this.sulifuPayWebhookHandler.processWebhook(payload, this.walletService);
  }

}
